import { NotFoundError } from '@zarax/shared-errors';
import { asTenantId } from '@zarax/shared-types';
import { describe, expect, it } from 'vitest';

import { AgentRepository } from '../agent.repository';

/** Minimal in-memory fake standing in for PrismaClient, just enough surface for
 * AgentRepository's versioning methods (including a simulated $transaction). */
function buildFakePrisma() {
  const agents = new Map<string, { id: string; tenantId: string; config: unknown; currentVersion: number; deletedAt: Date | null }>();
  const versions: Array<{ id: string; agentId: string; tenantId: string; version: number; config: unknown; createdBy: string | null; createdAt: Date }> = [];
  let versionIdCounter = 0;

  agents.set('agent-1', {
    id: 'agent-1',
    tenantId: 'tenant-1',
    config: { systemPrompt: 'v1 prompt' },
    currentVersion: 1,
    deletedAt: null,
  });

  const txClient = {
    agent: {
      findFirst: async ({ where }: { where: { id: string; tenantId: string; deletedAt: null } }) => {
        const agent = agents.get(where.id);
        if (!agent || agent.tenantId !== where.tenantId || agent.deletedAt) return null;
        return agent;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<{ config: unknown; currentVersion: number }> }) => {
        const agent = agents.get(where.id);
        if (!agent) throw new Error(`test fixture missing agent ${where.id}`);
        Object.assign(agent, data);
        return agent;
      },
    },
    agentVersion: {
      create: async ({ data }: { data: { agentId: string; tenantId: string; version: number; config: unknown; createdBy?: string } }) => {
        versionIdCounter += 1;
        const record = { id: `v${versionIdCounter}`, ...data, createdBy: data.createdBy ?? null, createdAt: new Date() };
        versions.push(record);
        return record;
      },
    },
  };

  return {
    agent: agents,
    $transaction: async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient),
    agentVersion: {
      findMany: async ({ where }: { where: { tenantId: string; agentId: string } }) =>
        versions.filter((v) => v.tenantId === where.tenantId && v.agentId === where.agentId).sort((a, b) => b.version - a.version),
      findUnique: async ({ where }: { where: { agentId_version: { agentId: string; version: number } } }) =>
        versions.find(
          (v) => v.agentId === where.agentId_version.agentId && v.version === where.agentId_version.version,
        ) ?? null,
    },
  };
}

describe('AgentRepository versioning', () => {
  const tenantId = asTenantId('tenant-1');

  it('creates a new version and updates the agent config in one step', async () => {
    const prisma = buildFakePrisma();
    const repo = new AgentRepository(prisma as never);

    const version = await repo.createVersion({
      tenantId,
      agentId: 'agent-1',
      config: { systemPrompt: 'v2 prompt' },
      createdBy: 'user-1',
    });

    expect(version.version).toBe(2);
    expect(prisma.agent.get('agent-1')?.currentVersion).toBe(2);
    expect(prisma.agent.get('agent-1')?.config).toEqual({ systemPrompt: 'v2 prompt' });
  });

  it('lists versions newest-first', async () => {
    const prisma = buildFakePrisma();
    const repo = new AgentRepository(prisma as never);

    await repo.createVersion({ tenantId, agentId: 'agent-1', config: { systemPrompt: 'v2' } });
    await repo.createVersion({ tenantId, agentId: 'agent-1', config: { systemPrompt: 'v3' } });

    const versions = await repo.listVersions(tenantId, 'agent-1');
    expect(versions.map((v) => v.version)).toEqual([3, 2]);
  });

  it('rollback creates a new version matching an old one, rather than rewriting history', async () => {
    const prisma = buildFakePrisma();
    const repo = new AgentRepository(prisma as never);

    await repo.createVersion({ tenantId, agentId: 'agent-1', config: { systemPrompt: 'v2 (bad)' } });
    const rolledBack = await repo.rollbackToVersion(tenantId, 'agent-1', 1, 'user-1');

    expect(rolledBack.version).toBe(3); // a NEW version, not overwriting version 1
    expect(rolledBack.config).toEqual({ systemPrompt: 'v1 prompt' });

    const allVersions = await repo.listVersions(tenantId, 'agent-1');
    expect(allVersions).toHaveLength(2); // v2 and the new v3 rollback snapshot
  });

  it('throws NotFoundError when rolling back to a version that does not exist', async () => {
    const prisma = buildFakePrisma();
    const repo = new AgentRepository(prisma as never);

    await expect(repo.rollbackToVersion(tenantId, 'agent-1', 99, 'user-1')).rejects.toThrow(
      NotFoundError,
    );
  });

  it('throws NotFoundError when creating a version for a nonexistent/deleted agent', async () => {
    const prisma = buildFakePrisma();
    const repo = new AgentRepository(prisma as never);

    await expect(
      repo.createVersion({ tenantId, agentId: 'no-such-agent', config: {} }),
    ).rejects.toThrow(NotFoundError);
  });
});
