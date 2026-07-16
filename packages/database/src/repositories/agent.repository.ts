import type { Prisma, PrismaClient, Agent as PrismaAgent } from '@prisma/client';
import { NotFoundError } from '@zarax/shared-errors';
import type { TenantId } from '@zarax/shared-types';

import { TenantScopedRepository } from './tenant-scoped.repository';

export interface AgentRecord {
  id: string;
  tenantId: string;
  name: string;
  isActive: boolean;
  config: Record<string, unknown>;
}

function toRecord(agent: PrismaAgent): AgentRecord {
  return {
    id: agent.id,
    tenantId: agent.tenantId,
    name: agent.name,
    isActive: agent.isActive,
    config: agent.config as Record<string, unknown>,
  };
}

export class AgentRepository extends TenantScopedRepository<PrismaAgent, Prisma.AgentWhereInput> {
  constructor(private readonly prisma: PrismaClient) {
    super(prisma.agent);
  }

  async findByIdForTenant(tenantId: TenantId, agentId: string): Promise<AgentRecord | null> {
    const agent = await this.findFirstForTenant(tenantId, { id: agentId });
    return agent ? toRecord(agent) : null;
  }

  async findByIdForTenantOrThrow(tenantId: TenantId, agentId: string): Promise<AgentRecord> {
    const agent = await this.findByIdForTenant(tenantId, agentId);
    if (!agent) throw new NotFoundError('Agent', agentId);
    if (!agent.isActive) throw new NotFoundError('Agent', agentId);
    return agent;
  }

  async listForTenant(tenantId: TenantId): Promise<AgentRecord[]> {
    const agents = await this.findManyForTenant(tenantId);
    return agents.map(toRecord);
  }
}
