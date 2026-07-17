import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RateLimit } from '@zarax/api-standards';
import { CurrentPrincipal, RequirePermission } from '@zarax/shared-auth';
import { PERMISSIONS, type Principal } from '@zarax/shared-types';

import { AgentsService } from './agents.service';
import type { ToolCatalogEntry } from './clients/tool-catalog.client';
import type { TestTurnResult } from './clients/llm-orchestrator.client';
import { CreateAgentDto } from './dto/create-agent.dto';
import type { AgentResponseDto, AgentVersionResponseDto } from './dto/agent-response.dto';
import { TestAgentDto } from './dto/test-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';

/**
 * Audit logging for every mutation here happens inside AgentsService.record() calls,
 * not via the declarative @Audited() decorator — the service layer has richer
 * context (e.g. the target rollback version, or what an agent was cloned from) than
 * the interceptor could infer from the route alone. Using both would double-log.
 */
@ApiTags('agents')
@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @RequirePermission(PERMISSIONS.AGENTS_CREATE)
  @ApiOperation({ summary: 'Create a new voice agent (draft by default).' })
  @Post()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateAgentDto,
  ): Promise<AgentResponseDto> {
    return this.agentsService.create(principal.tenantId, principal, dto);
  }

  @RequirePermission(PERMISSIONS.AGENTS_READ)
  @ApiOperation({ summary: "List the tenant's agents." })
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<AgentResponseDto[]> {
    return this.agentsService.list(principal.tenantId);
  }

  @RequirePermission(PERMISSIONS.AGENTS_READ)
  @ApiOperation({ summary: 'List the available tools an agent can be configured to use.' })
  @Get('tools-catalog')
  async getToolsCatalog(): Promise<ToolCatalogEntry[]> {
    return this.agentsService.getToolsCatalog();
  }

  @RequirePermission(PERMISSIONS.AGENTS_READ)
  @ApiOperation({ summary: 'List voice-agent-related feature flags for the current tenant.' })
  @Get('feature-flags')
  async getFeatureFlags(
    @CurrentPrincipal() principal: Principal,
  ): Promise<Array<{ key: string; label: string; enabled: boolean }>> {
    return this.agentsService.getFeatureFlags(principal.tenantId);
  }

  @RequirePermission(PERMISSIONS.AGENTS_READ)
  @ApiOperation({ summary: 'Get one agent by id.' })
  @Get(':id')
  async get(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ): Promise<AgentResponseDto> {
    return this.agentsService.get(principal.tenantId, id);
  }

  @RequirePermission(PERMISSIONS.AGENTS_UPDATE)
  @ApiOperation({
    summary: 'Update an agent. A config change creates a new version automatically.',
  })
  @Patch(':id')
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() dto: UpdateAgentDto,
  ): Promise<AgentResponseDto> {
    return this.agentsService.update(principal.tenantId, principal, id, dto);
  }

  @RequirePermission(PERMISSIONS.AGENTS_DELETE)
  @ApiOperation({ summary: 'Soft-delete an agent.' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(@CurrentPrincipal() principal: Principal, @Param('id') id: string): Promise<void> {
    await this.agentsService.remove(principal.tenantId, principal, id);
  }

  @RequirePermission(PERMISSIONS.AGENTS_READ)
  @ApiOperation({ summary: 'List every version snapshot of an agent, newest first.' })
  @Get(':id/versions')
  async listVersions(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ): Promise<AgentVersionResponseDto[]> {
    return this.agentsService.listVersions(principal.tenantId, id);
  }

  @RequirePermission(PERMISSIONS.AGENTS_UPDATE)
  @ApiOperation({
    summary: 'Roll back to a previous version — creates a new version matching the target, rather than rewriting history.',
  })
  @Post(':id/versions/:version/rollback')
  async rollback(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Param('version', ParseIntPipe) version: number,
  ): Promise<AgentResponseDto> {
    return this.agentsService.rollback(principal.tenantId, principal, id, version);
  }

  @RequirePermission(PERMISSIONS.AGENTS_UPDATE)
  @ApiOperation({ summary: 'Publish an agent — makes it reachable by real calls.' })
  @HttpCode(HttpStatus.OK)
  @Post(':id/publish')
  async publish(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ): Promise<AgentResponseDto> {
    return this.agentsService.publish(principal.tenantId, principal, id);
  }

  @RequirePermission(PERMISSIONS.AGENTS_UPDATE)
  @ApiOperation({ summary: 'Unpublish an agent — reverts it to draft, no longer reachable by real calls.' })
  @HttpCode(HttpStatus.OK)
  @Post(':id/unpublish')
  async unpublish(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ): Promise<AgentResponseDto> {
    return this.agentsService.unpublish(principal.tenantId, principal, id);
  }

  @RequirePermission(PERMISSIONS.AGENTS_CREATE)
  @ApiOperation({ summary: 'Clone an agent into a new draft with the same configuration.' })
  @Post(':id/clone')
  async clone(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ): Promise<AgentResponseDto> {
    return this.agentsService.clone(principal.tenantId, principal, id);
  }

  @RequirePermission(PERMISSIONS.AGENTS_READ)
  @RateLimit({ limit: 20, windowMs: 60_000 })
  @ApiOperation({
    summary: 'Send a test message through the real conversation pipeline (tool loop, RAG, metering all apply).',
  })
  @HttpCode(HttpStatus.OK)
  @Post(':id/test')
  async test(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() dto: TestAgentDto,
  ): Promise<TestTurnResult> {
    return this.agentsService.test(principal.tenantId, principal, id, dto);
  }
}
