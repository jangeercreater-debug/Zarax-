import type { Prisma, PrismaClient, Workflow as PrismaWorkflow } from '@prisma/client';
import { NotFoundError, ValidationError } from '@zarax/shared-errors';
import type { TenantId } from '@zarax/shared-types';

import { TenantScopedRepository } from './tenant-scoped.repository';

export interface WorkflowRecord {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  definition: Record<string, unknown>;
  currentVersion: number;
}

export interface WorkflowVersionRecord {
  id: string;
  workflowId: string;
  version: number;
  definition: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
}

function toRecord(workflow: PrismaWorkflow): WorkflowRecord {
  return {
    id: workflow.id,
    tenantId: workflow.tenantId,
    name: workflow.name,
    description: workflow.description,
    isActive: workflow.isActive,
    definition: workflow.definition as Record<string, unknown>,
    currentVersion: workflow.currentVersion,
  };
}

export class WorkflowRepository extends TenantScopedRepository<
  PrismaWorkflow,
  Prisma.WorkflowWhereInput
> {
  constructor(private readonly prisma: PrismaClient) {
    super(prisma.workflow);
  }

  /** No isActive gate here — a draft is a normal, editable, testable workflow, not
   * "not found". Same reasoning as AgentRepository.findByIdForTenantOrThrow — see
   * that method's comment for the full rationale and the M7E bug it fixed. */
  async findByIdForTenantOrThrow(tenantId: TenantId, id: string): Promise<WorkflowRecord> {
    const workflow = await this.findFirstForTenant(tenantId, { id, deletedAt: null });
    if (!workflow) throw new NotFoundError('Workflow', id);
    return toRecord(workflow);
  }

  /** Used specifically where "must be published" actually matters — execution of a
   * non-manual (event) trigger would check this; manual "Test Workflow" runs do not,
   * matching Agent's draft-is-testable model. */
  async assertPublishedForTenant(tenantId: TenantId, id: string): Promise<WorkflowRecord> {
    const workflow = await this.findByIdForTenantOrThrow(tenantId, id);
    if (!workflow.isActive) {
      throw new ValidationError(`Workflow '${id}' is not published yet.`);
    }
    return workflow;
  }

  async listForTenant(tenantId: TenantId): Promise<WorkflowRecord[]> {
    const workflows = await this.findManyForTenant(tenantId, { deletedAt: null });
    return workflows.map(toRecord);
  }

  async create(params: {
    tenantId: TenantId;
    name: string;
    description?: string;
    definition: Record<string, unknown>;
    createdBy?: string;
    isActive?: boolean;
  }): Promise<WorkflowRecord> {
    return this.prisma.$transaction(async (tx) => {
      const workflow = await tx.workflow.create({
        data: {
          tenantId: params.tenantId,
          name: params.name,
          description: params.description,
          definition: params.definition as never,
          currentVersion: 1,
          isActive: params.isActive ?? false,
        },
      });

      await tx.workflowVersion.create({
        data: {
          workflowId: workflow.id,
          tenantId: params.tenantId,
          version: 1,
          definition: params.definition as never,
          createdBy: params.createdBy,
        },
      });

      return toRecord(workflow);
    });
  }

  async updateMetadata(
    tenantId: TenantId,
    id: string,
    params: { name?: string; description?: string },
  ): Promise<WorkflowRecord> {
    const result = await this.prisma.workflow.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: params,
    });
    if (result.count === 0) throw new NotFoundError('Workflow', id);
    return this.findByIdForTenantOrThrow(tenantId, id);
  }

  async setPublished(tenantId: TenantId, id: string, isActive: boolean): Promise<WorkflowRecord> {
    const result = await this.prisma.workflow.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { isActive },
    });
    if (result.count === 0) throw new NotFoundError('Workflow', id);
    return this.findByIdForTenantOrThrow(tenantId, id);
  }

  async createVersion(params: {
    tenantId: TenantId;
    workflowId: string;
    definition: Record<string, unknown>;
    createdBy?: string;
  }): Promise<WorkflowVersionRecord> {
    return this.prisma.$transaction(async (tx) => {
      const workflow = await tx.workflow.findFirst({
        where: { id: params.workflowId, tenantId: params.tenantId, deletedAt: null },
      });
      if (!workflow) throw new NotFoundError('Workflow', params.workflowId);

      const nextVersion = workflow.currentVersion + 1;
      const version = await tx.workflowVersion.create({
        data: {
          workflowId: params.workflowId,
          tenantId: params.tenantId,
          version: nextVersion,
          definition: params.definition as never,
          createdBy: params.createdBy,
        },
      });

      await tx.workflow.update({
        where: { id: params.workflowId },
        data: { definition: params.definition as never, currentVersion: nextVersion },
      });

      return {
        id: version.id,
        workflowId: version.workflowId,
        version: version.version,
        definition: version.definition as Record<string, unknown>,
        createdBy: version.createdBy,
        createdAt: version.createdAt.toISOString(),
      };
    });
  }

  async listVersions(tenantId: TenantId, workflowId: string): Promise<WorkflowVersionRecord[]> {
    const versions = await this.prisma.workflowVersion.findMany({
      where: { tenantId, workflowId },
      orderBy: { version: 'desc' },
    });
    return versions.map((v) => ({
      id: v.id,
      workflowId: v.workflowId,
      version: v.version,
      definition: v.definition as Record<string, unknown>,
      createdBy: v.createdBy,
      createdAt: v.createdAt.toISOString(),
    }));
  }

  async rollbackToVersion(
    tenantId: TenantId,
    workflowId: string,
    targetVersion: number,
    createdBy?: string,
  ): Promise<WorkflowVersionRecord> {
    const target = await this.prisma.workflowVersion.findUnique({
      where: { workflowId_version: { workflowId, version: targetVersion } },
    });
    if (!target || target.tenantId !== tenantId) {
      throw new NotFoundError('WorkflowVersion', String(targetVersion));
    }

    return this.createVersion({
      tenantId,
      workflowId,
      definition: target.definition as Record<string, unknown>,
      createdBy,
    });
  }

  async softDelete(tenantId: TenantId, id: string): Promise<void> {
    const result = await this.prisma.workflow.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundError('Workflow', id);
  }
}
