import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { AuditLogService } from '@zarax/audit-log';
import {
  PRISMA_CLIENT,
  WorkflowExecutionRepository,
  WorkflowRepository,
  type NodeExecutionLogEntry,
  type PrismaClient,
} from '@zarax/database';
import { JobQueue } from '@zarax/job-queue';
import { ZARAX_LOGGER, type ZaraxLogger } from '@zarax/shared-logger';
import { asTenantId } from '@zarax/shared-types';
import type { Job } from 'bullmq';

import { AiAgentExecutor } from '../nodes/ai-agent.executor';
import { ConditionExecutor } from '../nodes/condition.executor';
import { DelayExecutor } from '../nodes/delay.executor';
import { EmailExecutor } from '../nodes/email.executor';
import { EndExecutor } from '../nodes/end.executor';
import { HttpNodeExecutor } from '../nodes/http.executor';
import { KnowledgeBaseExecutor } from '../nodes/knowledge-base.executor';
import type { NodeExecutor } from '../nodes/node-executor.interface';
import { TriggerExecutor } from '../nodes/trigger.executor';
import { findNextNode, findTriggerNode, getNodeById, type WorkflowGraph } from './graph-walker';

/** Must match services/api's WorkflowsService.WORKFLOW_EXECUTION_QUEUE_NAME exactly —
 * the one point of coupling between that producer and this consumer. See that
 * constant's own comment for why it's a plain matched string, not a shared export. */
const WORKFLOW_EXECUTION_QUEUE_NAME = 'workflow-execution';

export interface WorkflowExecutionJobData {
  executionId: string;
  workflowId: string;
  tenantId: string;
  /** Set only on a continuation job re-enqueued after a Delay node — tells this run
   * where to resume rather than starting over from the trigger. */
  resumeFromNodeId?: string;
}

@Injectable()
export class WorkflowExecutionConsumer implements OnModuleDestroy {
  private readonly queue: JobQueue<WorkflowExecutionJobData>;
  private readonly workflowRepository: WorkflowRepository;
  private readonly executionRepository: WorkflowExecutionRepository;
  private readonly executors: Map<string, NodeExecutor>;

  constructor(
    triggerExecutor: TriggerExecutor,
    aiAgentExecutor: AiAgentExecutor,
    knowledgeBaseExecutor: KnowledgeBaseExecutor,
    conditionExecutor: ConditionExecutor,
    delayExecutor: DelayExecutor,
    httpNodeExecutor: HttpNodeExecutor,
    emailExecutor: EmailExecutor,
    endExecutor: EndExecutor,
    @Inject(PRISMA_CLIENT) prisma: PrismaClient,
    private readonly auditLogService: AuditLogService,
    @Inject(ZARAX_LOGGER) private readonly logger: ZaraxLogger,
  ) {
    this.workflowRepository = new WorkflowRepository(prisma);
    this.executionRepository = new WorkflowExecutionRepository(prisma);

    this.executors = new Map<string, NodeExecutor>([
      ['trigger', triggerExecutor],
      ['ai_agent', aiAgentExecutor],
      ['knowledge_base', knowledgeBaseExecutor],
      ['condition', conditionExecutor],
      ['delay', delayExecutor],
      ['webhook', httpNodeExecutor], // HttpNodeExecutor handles both node type names
      ['http_request', httpNodeExecutor],
      ['email', emailExecutor],
      ['end', endExecutor],
    ]);

    this.queue = new JobQueue<WorkflowExecutionJobData>({
      name: WORKFLOW_EXECUTION_QUEUE_NAME,
      redisUrl: process.env.REDIS_URL ?? '',
      attempts: 1, // a partially-run workflow (e.g. a webhook already fired) is not safely retryable as a whole
      logger,
      onDeadLetter: async (data) => {
        await this.executionRepository
          .markFailed(data.originalData.executionId, `Execution crashed: ${data.failureReason}`)
          .catch(() => undefined); // the execution row may have been deleted mid-flight
      },
    });

    this.queue.process((job: Job<WorkflowExecutionJobData>) => this.runExecution(job.data));
  }

  private async runExecution(data: WorkflowExecutionJobData): Promise<void> {
    const tenantId = asTenantId(data.tenantId);
    const workflow = await this.workflowRepository.findByIdForTenantOrThrow(tenantId, data.workflowId);
    const execution = await this.executionRepository.findByIdForTenant(tenantId, data.executionId);
    if (!execution) return; // deleted mid-flight — nothing left to run

    await this.executionRepository.markRunning(execution.id);

    const graph = workflow.definition as unknown as WorkflowGraph;

    // Rebuilds context from whatever's already logged — correct both for a fresh run
    // (empty log) and a resumed-after-delay run (log has everything up to the delay).
    const context: Record<string, unknown> = { input: execution.input };
    for (const entry of execution.nodeExecutions) {
      context[entry.nodeId] = entry.output;
    }

    let currentNode = data.resumeFromNodeId
      ? getNodeById(graph, data.resumeFromNodeId)
      : findTriggerNode(graph);

    if (!currentNode) {
      await this.executionRepository.markFailed(execution.id, 'Workflow has no trigger node.');
      return;
    }

    while (currentNode) {
      const executor = this.executors.get(currentNode.type);
      if (!executor) {
        await this.executionRepository.markFailed(
          execution.id,
          `No executor registered for node type '${currentNode.type}'.`,
        );
        return;
      }

      const startedAt = new Date().toISOString();
      let result;
      try {
        result = await executor.execute(currentNode, { tenantId: data.tenantId, executionId: execution.id, context });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.logNodeResult(execution.id, currentNode.id, currentNode.type, 'failed', currentNode.data, null, startedAt, message);
        await this.executionRepository.markFailed(
          execution.id,
          `Node '${currentNode.id}' (${currentNode.type}) failed: ${message}`,
        );
        await this.recordExecutionAudit(tenantId, workflow.id, execution.id, 'failed');
        return;
      }

      await this.logNodeResult(execution.id, currentNode.id, currentNode.type, 'completed', currentNode.data, result.output, startedAt);
      context[currentNode.id] = result.output;

      if (currentNode.type === 'end') {
        await this.executionRepository.markCompleted(execution.id, context);
        await this.recordExecutionAudit(tenantId, workflow.id, execution.id, 'completed');
        return;
      }

      if (result.pauseForMs) {
        const nextNode = findNextNode(graph, currentNode.id);
        if (nextNode) {
          await this.queue.add('execute', { ...data, resumeFromNodeId: nextNode.id }, { delayMs: result.pauseForMs });
        } else {
          await this.executionRepository.markCompleted(execution.id, context);
          await this.recordExecutionAudit(tenantId, workflow.id, execution.id, 'completed');
        }
        return; // this invocation stops here; the continuation job (or nothing, if
        // there was no next node) picks up from here
      }

      currentNode = findNextNode(graph, currentNode.id, result.branch);
    }

    // Ran off the graph without hitting an 'end' node — a misconfigured workflow
    // (missing an end node), not necessarily an error worth failing loudly over.
    await this.executionRepository.markCompleted(execution.id, context);
    await this.recordExecutionAudit(tenantId, workflow.id, execution.id, 'completed');
  }

  private async logNodeResult(
    executionId: string,
    nodeId: string,
    nodeType: string,
    status: 'completed' | 'failed',
    input: unknown,
    output: unknown,
    startedAt: string,
    errorMessage?: string,
  ): Promise<void> {
    const entry: NodeExecutionLogEntry = {
      nodeId,
      nodeType,
      status,
      input,
      output,
      ...(errorMessage ? { errorMessage } : {}),
      startedAt,
      completedAt: new Date().toISOString(),
    };
    await this.executionRepository.appendNodeExecution(executionId, entry);
  }

  private async recordExecutionAudit(
    tenantId: ReturnType<typeof asTenantId>,
    workflowId: string,
    executionId: string,
    outcome: 'completed' | 'failed',
  ): Promise<void> {
    await this.auditLogService
      .recordSystemEvent({
        tenantId,
        action: `workflow.execution_${outcome}`,
        resourceType: 'workflow',
        resourceId: workflowId,
        metadata: { executionId },
      })
      .catch((error: unknown) => {
        this.logger.error('Failed to record workflow execution audit event', {
          executionId,
          message: error instanceof Error ? error.message : String(error),
        });
      });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
