import { Inject, Injectable } from '@nestjs/common';
import { AuditLogService } from '@zarax/audit-log';
import { AgentRepository, PRISMA_CLIENT, type PrismaClient } from '@zarax/database';
import type { Principal, TenantId } from '@zarax/shared-types';

import type { AgentResponseDto, AgentVersionResponseDto } from './dto/agent-response.dto';
import type { CreateAgentDto } from './dto/create-agent.dto';
import type { UpdateAgentDto } from './dto/update-agent.dto';

function toResponse(agent: {
  id: string;
  name: string;
  isActive: boolean;
  config: Record<string, unknown>;
  currentVersion: number;
}): AgentResponseDto {
  return {
    id: agent.id,
    name: agent.name,
    isActive: agent.isActive,
    config: agent.config,
    currentVersion: agent.currentVersion,
  };
}

@Injectable()
export class AgentsService {
  private readonly agentRepository: AgentRepository;

  constructor(
    @Inject(PRISMA_CLIENT) prisma: PrismaClient,
    private readonly auditLogService: AuditLogService,
  ) {
    this.agentRepository = new AgentRepository(prisma);
  }

  async create(tenantId: TenantId, principal: Principal, dto: CreateAgentDto): Promise<AgentResponseDto> {
    const agent = await this.agentRepository.create({
      tenantId,
      name: dto.name,
      config: (dto.config ?? {}) as Record<string, unknown>,
      createdBy: principal.id,
    });

    await this.auditLogService.record({
      principal,
      action: 'agent.created',
      resourceType: 'agent',
      resourceId: agent.id,
    });

    return toResponse(agent);
  }

  async get(tenantId: TenantId, agentId: string): Promise<AgentResponseDto> {
    const agent = await this.agentRepository.findByIdForTenantOrThrow(tenantId, agentId);
    return toResponse(agent);
  }

  async list(tenantId: TenantId): Promise<AgentResponseDto[]> {
    const agents = await this.agentRepository.listForTenant(tenantId);
    return agents.map(toResponse);
  }

  /** A name-only update never creates a new version (versioning tracks `config`, not
   * display metadata — see AgentRepository.updateName). A config change always
   * creates one, merged shallowly over the existing config so a partial PATCH
   * ({ config: { ragEnabled: true } }) doesn't clobber unrelated fields like
   * systemPrompt. */
  async update(
    tenantId: TenantId,
    principal: Principal,
    agentId: string,
    dto: UpdateAgentDto,
  ): Promise<AgentResponseDto> {
    const existing = await this.agentRepository.findByIdForTenantOrThrow(tenantId, agentId);

    if (dto.name) {
      await this.agentRepository.updateName(tenantId, agentId, dto.name);
    }

    if (dto.config) {
      const mergedConfig = { ...existing.config, ...dto.config } as Record<string, unknown>;
      await this.agentRepository.createVersion({
        tenantId,
        agentId,
        config: mergedConfig,
        createdBy: principal.id,
      });
      await this.auditLogService.record({
        principal,
        action: 'agent.config_updated',
        resourceType: 'agent',
        resourceId: agentId,
      });
    }

    return this.get(tenantId, agentId);
  }

  async remove(tenantId: TenantId, principal: Principal, agentId: string): Promise<void> {
    await this.agentRepository.findByIdForTenantOrThrow(tenantId, agentId); // 404s if missing/already deleted
    await this.agentRepository.softDelete(tenantId, agentId);

    await this.auditLogService.record({
      principal,
      action: 'agent.deleted',
      resourceType: 'agent',
      resourceId: agentId,
    });
  }

  async listVersions(tenantId: TenantId, agentId: string): Promise<AgentVersionResponseDto[]> {
    await this.agentRepository.findByIdForTenantOrThrow(tenantId, agentId);
    return this.agentRepository.listVersions(tenantId, agentId);
  }

  async rollback(
    tenantId: TenantId,
    principal: Principal,
    agentId: string,
    targetVersion: number,
  ): Promise<AgentResponseDto> {
    await this.agentRepository.rollbackToVersion(tenantId, agentId, targetVersion, principal.id);

    await this.auditLogService.record({
      principal,
      action: 'agent.rolled_back',
      resourceType: 'agent',
      resourceId: agentId,
      metadata: { toVersion: targetVersion },
    });

    return this.get(tenantId, agentId);
  }
}
