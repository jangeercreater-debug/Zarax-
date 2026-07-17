import { NotFoundError, ValidationError } from '@zarax/shared-errors';
import { asTenantId } from '@zarax/shared-types';
import { describe, expect, it } from 'vitest';

import { WorkflowRepository } from '../workflow.repository';

interface FakeWorkflow {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  definition: Record<string, unknown>;
  currentVersion: number;
  deletedAt: Date | null;
}

function buildFakePrisma(workflows: FakeWorkflow[]) {
  const versions: Array<{
    id: string;
    workflowId: string;
    tenantId: string;
    version: number;
    definition: Record<string, unknown>;
    createdBy: string | null;
    createdAt: Date;
  }> = [];
  let versionIdCounter = 0;

  const txClient = {
    workflow: {
      findFirst: async ({ where }: { where: { id: string; tenantId: string } }) =>
        workflows.find((w) => w.id === where.id && w.tenantId === where.tenantId) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeWorkflow> }) => {
        const workflow = workflows.find((w) => w.id === where.id);
        if (!workflow) throw new Error('not found');
        Object.assign(workflow, data);
        return workflow;
      },
    },
    workflowVersion: {
      create: async ({ data }: { data: Omit<(typeof versions)[number], 'id' | 'createdAt'> }) => {
        versionIdCounter += 1;
        const record = { id: `v${versionIdCounter}`, ...data, createdAt: new Date() };
        versions.push(record);
        return record;
      },
    },
  };

  return {
    workflow: {
      findFirst: async ({ where }: { where: { id: string; tenantId: string; deletedAt?: null } }) =>
        workflows.find(
          (w) =>
            w.id === where.id &&
            w.tenantId === where.tenantId &&
            (where.deletedAt === undefined || w.deletedAt === where.deletedAt),
        ) ?? null,
      findMany: async ({ where }: { where: { tenantId: string; deletedAt?: null } }) =>
        workflows.filter((w) => w.tenantId === where.tenantId && (where.deletedAt === undefined || w.deletedAt === where.deletedAt)),
      updateMany: async ({ where, data }: { where: { id: string; tenantId: string; deletedAt?: null }; data: Partial<FakeWorkflow> }) => {
        const workflow = workflows.find(
          (w) => w.id === where.id && w.tenantId === where.tenantId && (where.deletedAt === undefined || w.deletedAt === where.deletedAt),
        );
        if (!workflow) return { count: 0 };
        Object.assign(workflow, data);
        return { count: 1 };
      },
    },
    $transaction: async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient),
    workflowVersion: {
      findUnique: async ({ where }: { where: { workflowId_version: { workflowId: string; version: number } } }) =>
        versions.find(
          (v) => v.workflowId === where.workflowId_version.workflowId && v.version === where.workflowId_version.version,
        ) ?? null,
      findMany: async ({ where }: { where: { tenantId: string; workflowId: string } }) =>
        versions
          .filter((v) => v.tenantId === where.tenantId && v.workflowId === where.workflowId)
          .sort((a, b) => b.version - a.version),
    },
  };
}

describe('WorkflowRepository — draft/publish gating', () => {
  const tenantId = asTenantId('tenant-1');

  it('findByIdForTenantOrThrow returns a draft workflow normally', async () => {
    const prisma = buildFakePrisma([
      { id: 'wf-1', tenantId: 'tenant-1', name: 'Draft', description: null, isActive: false, definition: {}, currentVersion: 1, deletedAt: null },
    ]);
    const repo = new WorkflowRepository(prisma as never);

    const workflow = await repo.findByIdForTenantOrThrow(tenantId, 'wf-1');
    expect(workflow.isActive).toBe(false);
  });

  it('assertPublishedForTenant rejects a draft workflow', async () => {
    const prisma = buildFakePrisma([
      { id: 'wf-1', tenantId: 'tenant-1', name: 'Draft', description: null, isActive: false, definition: {}, currentVersion: 1, deletedAt: null },
    ]);
    const repo = new WorkflowRepository(prisma as never);

    await expect(repo.assertPublishedForTenant(tenantId, 'wf-1')).rejects.toThrow(ValidationError);
  });

  it('creates a workflow with an initial version', async () => {
    const prisma = buildFakePrisma([]);
    const repo = new WorkflowRepository(prisma as never);

    const workflow = await repo.create({
      tenantId,
      name: 'My Workflow',
      definition: { nodes: [], edges: [] },
    });

    expect(workflow.currentVersion).toBe(1);
    expect(workflow.isActive).toBe(false);
  });

  it('rollback creates a new version rather than rewriting history', async () => {
    const prisma = buildFakePrisma([
      { id: 'wf-1', tenantId: 'tenant-1', name: 'W', description: null, isActive: false, definition: { v: 1 }, currentVersion: 1, deletedAt: null },
    ]);
    const repo = new WorkflowRepository(prisma as never);
    await repo.createVersion({ tenantId, workflowId: 'wf-1', definition: { v: 1 } }); // seed v1 in the versions array too
    await repo.createVersion({ tenantId, workflowId: 'wf-1', definition: { v: 2 } });

    const rolledBack = await repo.rollbackToVersion(tenantId, 'wf-1', 2, 'user-1');
    expect(rolledBack.definition).toEqual({ v: 2 });

    const versions = await repo.listVersions(tenantId, 'wf-1');
    expect(versions.length).toBeGreaterThanOrEqual(3);
  });

  it('rollback throws NotFoundError for a nonexistent version', async () => {
    const prisma = buildFakePrisma([
      { id: 'wf-1', tenantId: 'tenant-1', name: 'W', description: null, isActive: false, definition: {}, currentVersion: 1, deletedAt: null },
    ]);
    const repo = new WorkflowRepository(prisma as never);

    await expect(repo.rollbackToVersion(tenantId, 'wf-1', 99, 'user-1')).rejects.toThrow(NotFoundError);
  });
});
