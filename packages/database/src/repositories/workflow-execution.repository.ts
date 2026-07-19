import type { PrismaClient } from '@prisma/client';
import type { TenantId } from '@zarax/shared-types';

export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed';
export type TriggerType = 'manual' | 'event';

export interface NodeExecutionLogEntry {
  nodeId: string;
  nodeType: string;
  status: 'completed' | 'failed' | 'skipped';
  input: unknown;
  output: unknown;
  errorMessage?: string;
  startedAt: string;
  completedAt: string;
}

export interface WorkflowExecutionRecord {
  id: string;
  workflowId: string;
  tenantId: string;
  status: ExecutionStatus;
  triggerType: TriggerType;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  errorMessage: string | null;
  nodeExecutions: NodeExecutionLogEntry[];
  startedAt: string;
  completedAt: string | null;
}

function toRecord(execution: {
  id: string;
  workflowId: string;
  tenantId: string;
  status: string;
  triggerType: string;
  input: unknown;
  output: unknown;
  errorMessage: string | null;
  nodeExecutions: unknown;
  startedAt: Date;
  completedAt: Date | null;
}): WorkflowExecutionRecord {
  return {
    id: execution.id,
    workflowId: execution.workflowId,
    tenantId: execution.tenantId,
    status: execution.status as ExecutionStatus,
    triggerType: execution.triggerType as TriggerType,
    input: execution.input as Record<string, unknown>,
    output: execution.output as Record<string, unknown> | null,
    errorMessage: execution.errorMessage,
    nodeExecutions: (execution.nodeExecutions as unknown as NodeExecutionLogEntry[]) ?? [],
    startedAt: execution.startedAt.toISOString(),
    completedAt: execution.completedAt?.toISOString() ?? null,
  };
}

export class WorkflowExecutionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(params: {
    tenantId: TenantId;
    workflowId: string;
    triggerType: TriggerType;
    input: Record<string, unknown>;
  }): Promise<WorkflowExecutionRecord> {
    const execution = await this.prisma.workflowExecution.create({
      data: {
        tenantId: params.tenantId,
        workflowId: params.workflowId,
        triggerType: params.triggerType,
        input: params.input as never,
      },
    });
    return toRecord(execution);
  }

  async findByIdForTenant(tenantId: TenantId, id: string): Promise<WorkflowExecutionRecord | null> {
    const execution = await this.prisma.workflowExecution.findFirst({ where: { id, tenantId } });
    return execution ? toRecord(execution) : null;
  }

  async listForWorkflow(tenantId: TenantId, workflowId: string, limit = 50): Promise<WorkflowExecutionRecord[]> {
    const executions = await this.prisma.workflowExecution.findMany({
      where: { tenantId, workflowId },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
    return executions.map(toRecord);
  }

  async markRunning(id: string): Promise<void> {
    await this.prisma.workflowExecution.update({ where: { id }, data: { status: 'running' } });
  }

  async appendNodeExecution(id: string, entry: NodeExecutionLogEntry): Promise<void> {
    const current = await this.prisma.workflowExecution.findUniqueOrThrow({ where: { id } });
    const log = ((current.nodeExecutions as unknown as NodeExecutionLogEntry[]) ?? []);
    await this.prisma.workflowExecution.update({
      where: { id },
      data: { nodeExecutions: [...log, entry] as never },
    });
  }

  async markCompleted(id: string, output: Record<string, unknown>): Promise<void> {
    await this.prisma.workflowExecution.update({
      where: { id },
      data: { status: 'completed', output: output as never, completedAt: new Date() },
    });
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    await this.prisma.workflowExecution.update({
      where: { id },
      data: { status: 'failed', errorMessage, completedAt: new Date() },
    });
  }
}
