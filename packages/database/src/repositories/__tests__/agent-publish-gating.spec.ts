import { NotFoundError, ValidationError } from '@zarax/shared-errors';
import { asTenantId } from '@zarax/shared-types';
import { describe, expect, it } from 'vitest';

import { AgentRepository } from '../agent.repository';

interface FakeAgent {
  id: string;
  tenantId: string;
  name: string;
  isActive: boolean;
  config: Record<string, unknown>;
  currentVersion: number;
  deletedAt: Date | null;
}

function buildFakePrisma(agents: FakeAgent[]) {
  const delegate = {
    findFirst: async ({ where }: { where: Partial<FakeAgent> & { tenantId: string } }) =>
      agents.find(
        (a) =>
          a.tenantId === where.tenantId &&
          (where.id === undefined || a.id === where.id) &&
          (where.deletedAt === undefined || a.deletedAt === where.deletedAt),
      ) ?? null,
    findMany: async () => agents,
    count: async () => agents.length,
  };
  return { agent: delegate };
}

describe('AgentRepository — draft/publish gating', () => {
  const tenantId = asTenantId('tenant-1');

  it('findByIdForTenantOrThrow returns a draft (isActive: false) agent normally — a draft is not "not found"', async () => {
    const prisma = buildFakePrisma([
      { id: 'agent-1', tenantId: 'tenant-1', name: 'Draft Agent', isActive: false, config: {}, currentVersion: 1, deletedAt: null },
    ]);
    const repo = new AgentRepository(prisma as never);

    const agent = await repo.findByIdForTenantOrThrow(tenantId, 'agent-1');
    expect(agent.isActive).toBe(false);
  });

  it('findByIdForTenantOrThrow still 404s a soft-deleted agent', async () => {
    const prisma = buildFakePrisma([
      { id: 'agent-1', tenantId: 'tenant-1', name: 'Deleted', isActive: true, config: {}, currentVersion: 1, deletedAt: new Date() },
    ]);
    const repo = new AgentRepository(prisma as never);

    await expect(repo.findByIdForTenantOrThrow(tenantId, 'agent-1')).rejects.toThrow(NotFoundError);
  });

  it('assertPublishedForTenant rejects a draft agent', async () => {
    const prisma = buildFakePrisma([
      { id: 'agent-1', tenantId: 'tenant-1', name: 'Draft', isActive: false, config: {}, currentVersion: 1, deletedAt: null },
    ]);
    const repo = new AgentRepository(prisma as never);

    await expect(repo.assertPublishedForTenant(tenantId, 'agent-1')).rejects.toThrow(ValidationError);
  });

  it('assertPublishedForTenant accepts a published agent', async () => {
    const prisma = buildFakePrisma([
      { id: 'agent-1', tenantId: 'tenant-1', name: 'Live', isActive: true, config: {}, currentVersion: 1, deletedAt: null },
    ]);
    const repo = new AgentRepository(prisma as never);

    const agent = await repo.assertPublishedForTenant(tenantId, 'agent-1');
    expect(agent.isActive).toBe(true);
  });
});
