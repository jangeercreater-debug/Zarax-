import { Inject, Injectable } from '@nestjs/common';
import { AuditLogService } from '@zarax/audit-log';
import {
  PRISMA_CLIENT,
  WorkflowExecutionRepository,
  WorkflowRepository,
  type PrismaClient,
} from '@zarax/database';
import { JobQueue } from '@zarax/job-queue';
import { NotFoundError, ValidationError } from '@zarax/shared-errors';
import type { Principal, TenantId } from '@zarax/shared-types';

import type { CreateWorkflowDto } from './dto/create-workflow.dto';
import type { ExecuteWorkflowDto } from './dto/execute-workflow.dto';
import type { UpdateWorkflowDto } from './dto/update-workflow.dto';
import type {
  WorkflowExecutionResponseDto,
  WorkflowResponseDto,
  WorkflowVersionResponseDto,
} from './dto/workflow-response.dto';

/** Shared, hardcoded queue name — the one point of coupling between this producer
 * (services/api) and services/workflow-engine's consumer. Documented identically in
 * both places since @zarax/job-queue's queue names are plain strings, not a shared
 * constant module (queue naming is application-specific, not job-queue's concern). */
export const WORKFLOW_EXECUTION_QUEUE_NAME = 'workflow-execution';

export interface WorkflowExecutionJobData {
  executionId: string;
  workflowId: string;
  tenantId: string;
}

function toResponse(workflow: {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  definition: Record<string, unknown>;
  currentVersion: number;
}): WorkflowResponseDto {
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    isActive: workflow.isActive,
    definition: workflow.definition,
    currentVersion: workflow.currentVersion,
  };
}

@Injectable()
export class WorkflowsService {
  private readonly workflowRepository: WorkflowRepository;
  private readonly executionRepository: WorkflowExecutionRepository;
  private readonly executionQueue: JobQueue<WorkflowExecutionJobData>;

  constructor(
    @Inject(PRISMA_CLIENT) prisma: PrismaClient,
    private readonly auditLogService: AuditLogService,
  ) {
    this.workflowRepository = new WorkflowRepository(prisma);
    this.executionRepository = new WorkflowExecutionRepository(prisma);
    // Producer only — never calls .process() here, that's services/workflow-engine's
    // job. Constructing a JobQueue instance just to .add() is a bit heavier than a
    // raw BullMQ Queue would need to be, but keeps this on the same
    // retry/backoff/dead-letter configuration as the consumer expects by convention.
    this.executionQueue = new JobQueue<WorkflowExecutionJobData>({
      name: WORKFLOW_EXECUTION_QUEUE_NAME,
      redisUrl: process.env.REDIS_URL ?? '',
      attempts: 1, // a workflow run is not safely retryable as a whole (side effects like webhooks/emails may have already fired) — a failed run is surfaced via its own status, not retried automatically
    });
  }

  async create(tenantId: TenantId, principal: Principal, dto: CreateWorkflowDto): Promise<WorkflowResponseDto> {
    const workflow = await this.workflowRepository.create({
      tenantId,
      name: dto.name,
      description: dto.description,
      definition: (dto.definition ?? { nodes: [], edges: [] }) as unknown as Record<string, unknown>,
      createdBy: principal.id,
      isActive: dto.publishOnCreate ?? false,
    });

    await this.auditLogService.record({
      principal,
      action: 'workflow.created',
      resourceType: 'workflow',
      resourceId: workflow.id,
    });

    return toResponse(workflow);
  }

  async get(tenantId: TenantId, id: string): Promise<WorkflowResponseDto> {
    const workflow = await this.workflowRepository.findByIdForTenantOrThrow(tenantId, id);
    return toResponse(workflow);
  }

  async list(tenantId: TenantId): Promise<WorkflowResponseDto[]> {
    const workflows = await this.workflowRepository.listForTenant(tenantId);
    return workflows.map(toResponse);
  }

  async update(
    tenantId: TenantId,
    principal: Principal,
    id: string,
    dto: UpdateWorkflowDto,
  ): Promise<WorkflowResponseDto> {
    await this.workflowRepository.findByIdForTenantOrThrow(tenantId, id);

    if (dto.name !== undefined || dto.description !== undefined) {
      await this.workflowRepository.updateMetadata(tenantId, id, {
        name: dto.name,
        description: dto.description,
      });
    }

    if (dto.definition) {
      await this.workflowRepository.createVersion({
        tenantId,
        workflowId: id,
        definition: dto.definition as unknown as Record<string, unknown>,
        createdBy: principal.id,
      });
      await this.auditLogService.record({
        principal,
        action: 'workflow.definition_updated',
        resourceType: 'workflow',
        resourceId: id,
      });
    }

    return this.get(tenantId, id);
  }

  async remove(tenantId: TenantId, principal: Principal, id: string): Promise<void> {
    await this.workflowRepository.findByIdForTenantOrThrow(tenantId, id);
    await this.workflowRepository.softDelete(tenantId, id);

    await this.auditLogService.record({
      principal,
      action: 'workflow.deleted',
      resourceType: 'workflow',
      resourceId: id,
    });
  }

  /** Requires at least one 'trigger' node and one 'end' node — a workflow missing
   * either can't meaningfully run (nothing to start from, or no defined completion). */
  async publish(tenantId: TenantId, principal: Principal, id: string): Promise<WorkflowResponseDto> {
    const existing = await this.workflowRepository.findByIdForTenantOrThrow(tenantId, id);
    const nodes = (existing.definition.nodes as Array<{ type: string }> | undefined) ?? [];

    if (!nodes.some((n) => n.type === 'trigger')) {
      throw new ValidationError('Add a trigger node before publishing this workflow.');
    }
    if (!nodes.some((n) => n.type === 'end')) {
      throw new ValidationError('Add an end node before publishing this workflow.');
    }

    const workflow = await this.workflowRepository.setPublished(tenantId, id, true);

    await this.auditLogService.record({
      principal,
      action: 'workflow.published',
      resourceType: 'workflow',
      resourceId: id,
    });

    return toResponse(workflow);
  }

  async unpublish(tenantId: TenantId, principal: Principal, id: string): Promise<WorkflowResponseDto> {
    const workflow = await this.workflowRepository.setPublished(tenantId, id, false);

    await this.auditLogService.record({
      principal,
      action: 'workflow.unpublished',
      resourceType: 'workflow',
      resourceId: id,
    });

    return toResponse(workflow);
  }

  async listVersions(tenantId: TenantId, id: string): Promise<WorkflowVersionResponseDto[]> {
    await this.workflowRepository.findByIdForTenantOrThrow(tenantId, id);
    return this.workflowRepository.listVersions(tenantId, id);
  }

  async rollback(
    tenantId: TenantId,
    principal: Principal,
    id: string,
    targetVersion: number,
  ): Promise<WorkflowResponseDto> {
    await this.workflowRepository.rollbackToVersion(tenantId, id, targetVersion, principal.id);

    await this.auditLogService.record({
      principal,
      action: 'workflow.rolled_back',
      resourceType: 'workflow',
      resourceId: id,
      metadata: { toVersion: targetVersion },
    });

    return this.get(tenantId, id);
  }

  /** Works for drafts too (findByIdForTenantOrThrow doesn't gate on isActive) — a
   * "Test Workflow" run against an unpublished workflow is normal. Execution itself
   * happens entirely in services/workflow-engine; this only enqueues the job. */
  async execute(
    tenantId: TenantId,
    principal: Principal,
    id: string,
    dto: ExecuteWorkflowDto,
  ): Promise<WorkflowExecutionResponseDto> {
    await this.workflowRepository.findByIdForTenantOrThrow(tenantId, id);

    const execution = await this.executionRepository.create({
      tenantId,
      workflowId: id,
      triggerType: 'manual',
      input: dto.input ?? {},
    });

    await this.executionQueue.add('execute', {
      executionId: execution.id,
      workflowId: id,
      tenantId,
    });

    await this.auditLogService.record({
      principal,
      action: 'workflow.execution_triggered',
      resourceType: 'workflow',
      resourceId: id,
      metadata: { executionId: execution.id },
    });

    return execution;
  }

  async listExecutions(tenantId: TenantId, workflowId: string): Promise<WorkflowExecutionResponseDto[]> {
    await this.workflowRepository.findByIdForTenantOrThrow(tenantId, workflowId);
    return this.executionRepository.listForWorkflow(tenantId, workflowId);
  }

  async getExecution(
    tenantId: TenantId,
    workflowId: string,
    executionId: string,
  ): Promise<WorkflowExecutionResponseDto> {
    await this.workflowRepository.findByIdForTenantOrThrow(tenantId, workflowId);
    const execution = await this.executionRepository.findByIdForTenant(tenantId, executionId);
    if (!execution || execution.workflowId !== workflowId) {
      throw new NotFoundError('WorkflowExecution', executionId);
    }
    return execution;
  }
}
