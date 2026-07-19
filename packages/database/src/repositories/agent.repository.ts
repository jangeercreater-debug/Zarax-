import type { Prisma, PrismaClient, Agent as PrismaAgent } from '@prisma/client';
import { NotFoundError, ValidationError } from '@zarax/shared-errors';
import type { TenantId } from '@zarax/shared-types';

import { TenantScopedRepository } from './tenant-scoped.repository';

export interface AgentRecord {
  id: string;
  tenantId: string;
  name: string;
  isActive: boolean;
  config: Record<string, unknown>;
  currentVersion: number;
}

export interface AgentVersionRecord {
  id: string;
  agentId: string;
  version: number;
  config: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
}

function toRecord(agent: PrismaAgent): AgentRecord {
  return {
    id: agent.id,
    tenantId: agent.tenantId,
    name: agent.name,
    isActive: agent.isActive,
    config: agent.config as Record<string, unknown>,
    currentVersion: agent.currentVersion,
  };
}

export class AgentRepository extends TenantScopedRepository<PrismaAgent, Prisma.AgentWhereInput> {
  constructor(private readonly prisma: PrismaClient) {
    super(prisma.agent);
  }

  /** Every read method here excludes soft-deleted rows (`deletedAt: null`) by
   * default — see docs/data-retention-policy.md. There is no "include deleted" flag;
   * a genuinely deleted-agent lookup (e.g. for an audit trail) should query
   * AgentVersion history instead, not resurrect the Agent row itself. */
  async findByIdForTenant(tenantId: TenantId, agentId: string): Promise<AgentRecord | null> {
    const agent = await this.findFirstForTenant(tenantId, { id: agentId, deletedAt: null });
    return agent ? toRecord(agent) : null;
  }

  async findByIdForTenantOrThrow(tenantId: TenantId, agentId: string): Promise<AgentRecord> {
    const agent = await this.findByIdForTenant(tenantId, agentId);
    if (!agent) throw new NotFoundError('Agent', agentId);
    return agent;
  }

  /** Used specifically where "must be live" actually matters — today, only
   * voice-gateway's room creation (the one place a real caller reaches an agent).
   * Every other consumer (dashboard CRUD, test calls, tool execution) uses
   * findByIdForTenantOrThrow, which a draft (isActive: false) satisfies normally —
   * a draft is a completely ordinary, editable, testable agent; it just can't take
   * real calls yet. */
  async assertPublishedForTenant(tenantId: TenantId, agentId: string): Promise<AgentRecord> {
    const agent = await this.findByIdForTenantOrThrow(tenantId, agentId);
    if (!agent.isActive) {
      throw new ValidationError(
        `Agent '${agentId}' is not published yet — publish it before starting a call.`,
      );
    }
    return agent;
  }

  async listForTenant(tenantId: TenantId): Promise<AgentRecord[]> {
    const agents = await this.findManyForTenant(tenantId, { deletedAt: null });
    return agents.map(toRecord);
  }

  /** Creates the agent AND its initial (version 1) snapshot in one transaction — every
   * agent always has at least one AgentVersion row, so listVersions()/rollback always
   * have a valid target. `isActive` defaults to false (draft) — see
   * docs/production-standards.md's Voice Agent Builder section: a newly created
   * agent should not be reachable by real callers until explicitly published. */
  async create(params: {
    tenantId: TenantId;
    name: string;
    config: Record<string, unknown>;
    createdBy?: string;
    isActive?: boolean;
  }): Promise<AgentRecord> {
    return this.prisma.$transaction(async (tx) => {
      const agent = await tx.agent.create({
        data: {
          tenantId: params.tenantId,
          name: params.name,
          config: params.config as never,
          currentVersion: 1,
          isActive: params.isActive ?? false,
        },
      });

      await tx.agentVersion.create({
        data: {
          agentId: agent.id,
          tenantId: params.tenantId,
          version: 1,
          config: params.config as never,
          createdBy: params.createdBy,
        },
      });

      return toRecord(agent);
    });
  }

  /** Publish/unpublish — toggles `isActive` directly, independent of soft-delete.
   * Never creates a new AgentVersion (this is a status change, not a config change —
   * same principle as updateName). */
  async setPublished(tenantId: TenantId, agentId: string, isActive: boolean): Promise<AgentRecord> {
    const result = await this.prisma.agent.updateMany({
      where: { id: agentId, tenantId, deletedAt: null },
      data: { isActive },
    });
    if (result.count === 0) throw new NotFoundError('Agent', agentId);
    return this.findByIdForTenantOrThrow(tenantId, agentId);
  }

  /** Renaming an agent does NOT create a new AgentVersion — versioning tracks
   * `config` (the prompt/behavior), not display metadata. */
  async updateName(tenantId: TenantId, agentId: string, name: string): Promise<AgentRecord> {
    const result = await this.prisma.agent.updateMany({
      where: { id: agentId, tenantId, deletedAt: null },
      data: { name },
    });
    if (result.count === 0) throw new NotFoundError('Agent', agentId);
    return this.findByIdForTenantOrThrow(tenantId, agentId);
  }

  /** Soft delete — sets deletedAt rather than removing the row (and everything that
   * references it, e.g. Call history, AgentVersion snapshots, stays intact). */
  async softDelete(tenantId: TenantId, agentId: string): Promise<void> {
    await this.prisma.agent.updateMany({
      where: { id: agentId, tenantId },
      data: { deletedAt: new Date() },
    });
  }

  // -------------------------------------------------------------------------
  // Agent versioning / rollback (also covers "prompt version history" — the
  // system prompt lives inside `config`; see the schema comment on AgentVersion).
  // -------------------------------------------------------------------------

  /** Creates a new version snapshot AND updates the Agent's live config in one
   * transaction — the Agent row is always "the current version," AgentVersion rows
   * are the immutable history. */
  async createVersion(params: {
    tenantId: TenantId;
    agentId: string;
    config: Record<string, unknown>;
    createdBy?: string;
  }): Promise<AgentVersionRecord> {
    return this.prisma.$transaction(async (tx) => {
      const agent = await tx.agent.findFirst({
        where: { id: params.agentId, tenantId: params.tenantId, deletedAt: null },
      });
      if (!agent) throw new NotFoundError('Agent', params.agentId);

      const nextVersion = agent.currentVersion + 1;

      const version = await tx.agentVersion.create({
        data: {
          agentId: params.agentId,
          tenantId: params.tenantId,
          version: nextVersion,
          config: params.config as never,
          createdBy: params.createdBy,
        },
      });

      await tx.agent.update({
        where: { id: params.agentId },
        data: { config: params.config as never, currentVersion: nextVersion },
      });

      return {
        id: version.id,
        agentId: version.agentId,
        version: version.version,
        config: version.config as Record<string, unknown>,
        createdBy: version.createdBy,
        createdAt: version.createdAt.toISOString(),
      };
    });
  }

  async listVersions(tenantId: TenantId, agentId: string): Promise<AgentVersionRecord[]> {
    const versions = await this.prisma.agentVersion.findMany({
      where: { tenantId, agentId },
      orderBy: { version: 'desc' },
    });
    return versions.map((v) => ({
      id: v.id,
      agentId: v.agentId,
      version: v.version,
      config: v.config as Record<string, unknown>,
      createdBy: v.createdBy,
      createdAt: v.createdAt.toISOString(),
    }));
  }

  /** Rolling back doesn't delete history — it creates a *new* version whose config
   * matches an old one, so the version list always reads as a linear, honest audit
   * trail (never a rewritten past). */
  async rollbackToVersion(
    tenantId: TenantId,
    agentId: string,
    targetVersion: number,
    createdBy?: string,
  ): Promise<AgentVersionRecord> {
    const target = await this.prisma.agentVersion.findUnique({
      where: { agentId_version: { agentId, version: targetVersion } },
    });
    if (!target || target.tenantId !== tenantId) {
      throw new NotFoundError('AgentVersion', String(targetVersion));
    }

    return this.createVersion({
      tenantId,
      agentId,
      config: target.config as Record<string, unknown>,
      createdBy,
    });
  }
}
