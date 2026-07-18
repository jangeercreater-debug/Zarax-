import { NotFoundError, ValidationError } from '@zarax/shared-errors';
import { asTenantId, asUserId, type UserPrincipal } from '@zarax/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentsService } from '../agents.service';

interface FakeAgent {
  id: string;
  tenantId: string;
  name: string;
  isActive: boolean;
  config: Record<string, unknown>;
  currentVersion: number;
  deletedAt: Date | null;
}

function buildFakePrisma() {
  const agents = new Map<string, FakeAgent>();
  const versions: Array<{
    id: string;
    agentId: string;
    tenantId: string;
    version: number;
    config: Record<string, unknown>;
    createdBy: string | null;
    createdAt: Date;
  }> = [];
  let agentIdCounter = 0;
  let versionIdCounter = 0;

  const txClient = {
    agent: {
      create: async ({ data }: { data: Omit<FakeAgent, 'id' | 'isActive' | 'deletedAt'> }) => {
        agentIdCounter += 1;
        const agent: FakeAgent = { id: `agent-${agentIdCounter}`, isActive: true, deletedAt: null, ...data };
        agents.set(agent.id, agent);
        return agent;
      },
      findFirst: async ({ where }: { where: { id: string; tenantId: string; deletedAt: null } }) => {
        const agent = agents.get(where.id);
        if (!agent || agent.tenantId !== where.tenantId || agent.deletedAt) return null;
        return agent;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeAgent> }) => {
        const agent = agents.get(where.id);
        if (!agent) throw new Error('not found');
        Object.assign(agent, data);
        return agent;
      },
    },
    agentVersion: {
      create: async ({
        data,
      }: {
        data: { agentId: string; tenantId: string; version: number; config: Record<string, unknown>; createdBy?: string };
      }) => {
        versionIdCounter += 1;
        const record = { id: `v${versionIdCounter}`, ...data, createdBy: data.createdBy ?? null, createdAt: new Date() };
        versions.push(record);
        return record;
      },
    },
  };

  return {
    _agents: agents,
    agent: {
      findMany: async ({ where }: { where: { tenantId: string; deletedAt: null } }) =>
        [...agents.values()].filter((a) => a.tenantId === where.tenantId && !a.deletedAt),
      updateMany: async ({ where, data }: { where: { id: string; tenantId: string; deletedAt?: null }; data: Partial<FakeAgent> }) => {
        const agent = agents.get(where.id);
        if (!agent || agent.tenantId !== where.tenantId || (where.deletedAt === null && agent.deletedAt)) {
          return { count: 0 };
        }
        Object.assign(agent, data);
        return { count: 1 };
      },
      findFirst: txClient.agent.findFirst,
    },
    $transaction: async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient),
    agentVersion: {
      findMany: async ({ where }: { where: { tenantId: string; agentId: string } }) =>
        versions
          .filter((v) => v.tenantId === where.tenantId && v.agentId === where.agentId)
          .sort((a, b) => b.version - a.version),
      findUnique: async ({ where }: { where: { agentId_version: { agentId: string; version: number } } }) =>
        versions.find(
          (v) => v.agentId === where.agentId_version.agentId && v.version === where.agentId_version.version,
        ) ?? null,
    },
  };
}

function buildPrincipal(): UserPrincipal {
  return {
    type: 'user',
    id: asUserId('user-1'),
    tenantId: asTenantId('tenant-1'),
    email: 'a@b.com',
    roles: ['owner'],
    permissions: ['*'],
  };
}

describe('AgentsService', () => {
  const tenantId = asTenantId('tenant-1');
  let prisma: ReturnType<typeof buildFakePrisma>;
  let auditLogService: { record: ReturnType<typeof vi.fn> };
  let featureFlagService: { isEnabled: ReturnType<typeof vi.fn> };
  let llmOrchestratorClient: { testTurn: ReturnType<typeof vi.fn> };
  let toolCatalogClient: { listTools: ReturnType<typeof vi.fn> };
  let service: AgentsService;

  beforeEach(() => {
    prisma = buildFakePrisma();
    auditLogService = { record: vi.fn() };
    featureFlagService = { isEnabled: vi.fn().mockResolvedValue(false) };
    llmOrchestratorClient = { testTurn: vi.fn() };
    toolCatalogClient = { listTools: vi.fn() };
    service = new AgentsService(
      prisma as never,
      auditLogService as never,
      featureFlagService as never,
      llmOrchestratorClient as never,
      toolCatalogClient as never,
    );
  });

  it('creates an agent with an initial version and records an audit event', async () => {
    const principal = buildPrincipal();
    const agent = await service.create(tenantId, principal, {
      name: 'Support Bot',
      config: { systemPrompt: 'Be helpful.' },
    });

    expect(agent.name).toBe('Support Bot');
    expect(agent.currentVersion).toBe(1);
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'agent.created', resourceId: agent.id }),
    );
  });

  it('lists only non-deleted agents for the tenant', async () => {
    const principal = buildPrincipal();
    await service.create(tenantId, principal, { name: 'Agent A' });
    const toDelete = await service.create(tenantId, principal, { name: 'Agent B' });
    await service.remove(tenantId, principal, toDelete.id);

    const list = await service.list(tenantId);
    expect(list.map((a) => a.name)).toEqual(['Agent A']);
  });

  it('updating only the name does not create a new version', async () => {
    const principal = buildPrincipal();
    const agent = await service.create(tenantId, principal, { name: 'Old Name' });

    const updated = await service.update(tenantId, principal, agent.id, { name: 'New Name' });

    expect(updated.name).toBe('New Name');
    expect(updated.currentVersion).toBe(1); // unchanged
  });

  it('updating config creates a new version and merges over the existing config', async () => {
    const principal = buildPrincipal();
    const agent = await service.create(tenantId, principal, {
      name: 'Agent',
      config: { systemPrompt: 'v1', ragEnabled: false },
    });

    const updated = await service.update(tenantId, principal, agent.id, {
      config: { ragEnabled: true },
    });

    expect(updated.currentVersion).toBe(2);
    expect(updated.config).toEqual({ systemPrompt: 'v1', ragEnabled: true }); // merged, not replaced
  });

  it('soft-deletes an agent and records an audit event', async () => {
    const principal = buildPrincipal();
    const agent = await service.create(tenantId, principal, { name: 'To Delete' });

    await service.remove(tenantId, principal, agent.id);

    await expect(service.get(tenantId, agent.id)).rejects.toThrow(NotFoundError);
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'agent.deleted' }),
    );
  });

  it('lists versions newest-first', async () => {
    const principal = buildPrincipal();
    const agent = await service.create(tenantId, principal, { name: 'Agent', config: { systemPrompt: 'v1' } });
    await service.update(tenantId, principal, agent.id, { config: { systemPrompt: 'v2' } });

    const versions = await service.listVersions(tenantId, agent.id);
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
  });

  it('rollback creates a new version and records an audit event with the target version', async () => {
    const principal = buildPrincipal();
    const agent = await service.create(tenantId, principal, { name: 'Agent', config: { systemPrompt: 'v1' } });
    await service.update(tenantId, principal, agent.id, { config: { systemPrompt: 'v2 (bad)' } });

    const rolledBack = await service.rollback(tenantId, principal, agent.id, 1);

    expect(rolledBack.currentVersion).toBe(3);
    expect(rolledBack.config).toEqual({ systemPrompt: 'v1' });
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'agent.rolled_back', metadata: { toVersion: 1 } }),
    );
  });

  it('throws NotFoundError for an agent that does not belong to the tenant', async () => {
    const principal = buildPrincipal();
    const agent = await service.create(tenantId, principal, { name: 'Agent' });

    const otherTenant = asTenantId('tenant-2');
    await expect(service.get(otherTenant, agent.id)).rejects.toThrow(NotFoundError);
  });

  it('creates an agent as a draft (isActive: false) by default', async () => {
    const principal = buildPrincipal();
    const agent = await service.create(tenantId, principal, { name: 'Agent' });
    expect(agent.isActive).toBe(false);
  });

  it('publishOnCreate: true creates an already-published agent', async () => {
    const principal = buildPrincipal();
    const agent = await service.create(tenantId, principal, {
      name: 'Agent',
      config: { systemPrompt: 'Hello' },
      publishOnCreate: true,
    });
    expect(agent.isActive).toBe(true);
  });

  it('publish rejects an agent with no system prompt', async () => {
    const principal = buildPrincipal();
    const agent = await service.create(tenantId, principal, { name: 'Agent' }); // no config at all

    await expect(service.publish(tenantId, principal, agent.id)).rejects.toThrow(ValidationError);
  });

  it('publish succeeds once a system prompt is set, and records an audit event', async () => {
    const principal = buildPrincipal();
    const agent = await service.create(tenantId, principal, {
      name: 'Agent',
      config: { systemPrompt: 'Be helpful.' },
    });

    const published = await service.publish(tenantId, principal, agent.id);

    expect(published.isActive).toBe(true);
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'agent.published' }),
    );
  });

  it('unpublish reverts a published agent to draft', async () => {
    const principal = buildPrincipal();
    const agent = await service.create(tenantId, principal, {
      name: 'Agent',
      config: { systemPrompt: 'Be helpful.' },
      publishOnCreate: true,
    });

    const unpublished = await service.unpublish(tenantId, principal, agent.id);

    expect(unpublished.isActive).toBe(false);
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'agent.unpublished' }),
    );
  });

  it('clone creates an independent draft copy, even from a published source', async () => {
    const principal = buildPrincipal();
    const source = await service.create(tenantId, principal, {
      name: 'Original',
      config: { systemPrompt: 'Be helpful.' },
      publishOnCreate: true,
    });

    const clone = await service.clone(tenantId, principal, source.id);

    expect(clone.id).not.toBe(source.id);
    expect(clone.name).toBe('Original (Copy)');
    expect(clone.isActive).toBe(false); // never inherits the source's published state
    expect(clone.currentVersion).toBe(1); // fresh version history, not inherited
    expect(clone.config).toEqual(source.config);
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'agent.cloned', resourceId: clone.id }),
    );
  });

  it('test sends the message through LlmOrchestratorClient and records an audit event', async () => {
    const principal = buildPrincipal();
    const agent = await service.create(tenantId, principal, { name: 'Agent' });
    llmOrchestratorClient.testTurn.mockResolvedValue({ response: 'Hello there!', shouldEndCall: false });

    const result = await service.test(tenantId, principal, agent.id, { message: 'Hi' });

    expect(llmOrchestratorClient.testTurn).toHaveBeenCalledWith(tenantId, agent.id, 'Hi');
    expect(result.response).toBe('Hello there!');
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'agent.tested' }),
    );
  });

  it('test 404s before calling the orchestrator if the agent does not exist', async () => {
    const principal = buildPrincipal();
    await expect(service.test(tenantId, principal, 'no-such-agent', { message: 'Hi' })).rejects.toThrow(
      NotFoundError,
    );
    expect(llmOrchestratorClient.testTurn).not.toHaveBeenCalled();
  });

  it('getFeatureFlags returns the configured flags with real FeatureFlagService values', async () => {
    featureFlagService.isEnabled.mockImplementation(async (key: string) => key === 'advanced_interrupt_handling');

    const flags = await service.getFeatureFlags(tenantId);

    expect(flags).toEqual([
      { key: 'advanced_interrupt_handling', label: 'Advanced interrupt handling', enabled: true },
      { key: 'custom_voice_cloning', label: 'Custom voice cloning', enabled: false },
    ]);
  });

  it('getToolsCatalog delegates to ToolCatalogClient', async () => {
    toolCatalogClient.listTools.mockResolvedValue([{ name: 'get_current_datetime', description: 'd' }]);

    const catalog = await service.getToolsCatalog();

    expect(catalog).toEqual([{ name: 'get_current_datetime', description: 'd' }]);
  });
});
