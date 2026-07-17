import { Inject, Injectable } from '@nestjs/common';
import { AuditLogService } from '@zarax/audit-log';
import { AgentRepository, PRISMA_CLIENT, type PrismaClient } from '@zarax/database';
import { FeatureFlagService } from '@zarax/feature-flags';
import { ValidationError } from '@zarax/shared-errors';
import type { Principal, TenantId } from '@zarax/shared-types';

import { LlmOrchestratorClient, type TestTurnResult } from './clients/llm-orchestrator.client';
import { ToolCatalogClient, type ToolCatalogEntry } from './clients/tool-catalog.client';
import type { AgentResponseDto, AgentVersionResponseDto } from './dto/agent-response.dto';
import type { CreateAgentDto } from './dto/create-agent.dto';
import type { TestAgentDto } from './dto/test-agent.dto';
import type { UpdateAgentDto } from './dto/update-agent.dto';

/** Flags relevant to the Voice Agent Builder — defined here as the single reference
 * list; an operator turns one on for a tenant via FeatureFlagService.defineFlag() +
 * setOverride(). Fails closed (false) for any tenant with no explicit flag/override
 * row yet, per FeatureFlagService's documented default. */
const AGENT_BUILDER_FEATURE_FLAGS = ['advanced_interrupt_handling', 'custom_voice_cloning'] as const;

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
    private readonly featureFlagService: FeatureFlagService,
    private readonly llmOrchestratorClient: LlmOrchestratorClient,
    private readonly toolCatalogClient: ToolCatalogClient,
  ) {
    this.agentRepository = new AgentRepository(prisma);
  }

  /** New agents start as drafts (isActive: false) — see the schema comment on
   * Agent.isActive. Pass `publishOnCreate: true` to publish immediately (e.g. a
   * "quick start" flow that skips the draft step). */
  async create(tenantId: TenantId, principal: Principal, dto: CreateAgentDto): Promise<AgentResponseDto> {
    const agent = await this.agentRepository.create({
      tenantId,
      name: dto.name,
      config: (dto.config ?? {}) as Record<string, unknown>,
      createdBy: principal.id,
      isActive: dto.publishOnCreate ?? false,
    });

    await this.auditLogService.record({
      principal,
      action: 'agent.created',
      resourceType: 'agent',
      resourceId: agent.id,
      metadata: { publishedOnCreate: dto.publishOnCreate ?? false },
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

  async publish(tenantId: TenantId, principal: Principal, agentId: string): Promise<AgentResponseDto> {
    const existing = await this.agentRepository.findByIdForTenantOrThrow(tenantId, agentId);
    const systemPrompt = (existing.config as { systemPrompt?: string }).systemPrompt;
    if (!systemPrompt || !systemPrompt.trim()) {
      throw new ValidationError('Set a system prompt before publishing this agent.');
    }

    const agent = await this.agentRepository.setPublished(tenantId, agentId, true);

    await this.auditLogService.record({
      principal,
      action: 'agent.published',
      resourceType: 'agent',
      resourceId: agentId,
    });

    return toResponse(agent);
  }

  async unpublish(tenantId: TenantId, principal: Principal, agentId: string): Promise<AgentResponseDto> {
    const agent = await this.agentRepository.setPublished(tenantId, agentId, false);

    await this.auditLogService.record({
      principal,
      action: 'agent.unpublished',
      resourceType: 'agent',
      resourceId: agentId,
    });

    return toResponse(agent);
  }

  /** Clones config only, not version history or publish state — a clone always
   * starts as a fresh draft (version 1) regardless of the source agent's state, so
   * cloning a published agent never accidentally publishes a duplicate. */
  async clone(tenantId: TenantId, principal: Principal, agentId: string): Promise<AgentResponseDto> {
    const source = await this.agentRepository.findByIdForTenantOrThrow(tenantId, agentId);

    const cloned = await this.agentRepository.create({
      tenantId,
      name: `${source.name} (Copy)`,
      config: source.config,
      createdBy: principal.id,
      isActive: false,
    });

    await this.auditLogService.record({
      principal,
      action: 'agent.cloned',
      resourceType: 'agent',
      resourceId: cloned.id,
      metadata: { sourceAgentId: agentId },
    });

    return toResponse(cloned);
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

  /** Sends one message through llm-orchestrator's real conversation pipeline for this
   * agent — works for drafts too (findByIdForTenantOrThrow doesn't gate on
   * isActive; only real calls, via voice-gateway, require a published agent). Not
   * persisted anywhere — this is a stateless dry run, not a real call record. */
  async test(tenantId: TenantId, principal: Principal, agentId: string, dto: TestAgentDto): Promise<TestTurnResult> {
    await this.agentRepository.findByIdForTenantOrThrow(tenantId, agentId); // confirms it exists in this tenant before spending an LLM call on it

    const result = await this.llmOrchestratorClient.testTurn(agentId, dto.message);

    await this.auditLogService.record({
      principal,
      action: 'agent.tested',
      resourceType: 'agent',
      resourceId: agentId,
    });

    return result;
  }

  async getToolsCatalog(): Promise<ToolCatalogEntry[]> {
    return this.toolCatalogClient.listTools();
  }

  async getFeatureFlags(tenantId: TenantId): Promise<Array<{ key: string; label: string; enabled: boolean }>> {
    const labels: Record<(typeof AGENT_BUILDER_FEATURE_FLAGS)[number], string> = {
      advanced_interrupt_handling: 'Advanced interrupt handling',
      custom_voice_cloning: 'Custom voice cloning',
    };

    return Promise.all(
      AGENT_BUILDER_FEATURE_FLAGS.map(async (key) => ({
        key,
        label: labels[key],
        enabled: await this.featureFlagService.isEnabled(key, tenantId),
      })),
    );
  }
}
