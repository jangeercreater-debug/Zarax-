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
import { CurrentPrincipal, RequirePermission } from '@zarax/shared-auth';
import { PERMISSIONS, type Principal } from '@zarax/shared-types';

import { AgentsService } from './agents.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import type { AgentResponseDto, AgentVersionResponseDto } from './dto/agent-response.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';

/**
 * Audit logging for every mutation here happens inside AgentsService.record() calls,
 * not via the declarative @Audited() decorator — the service layer has richer
 * context (e.g. the target rollback version) than the interceptor could infer from
 * the route alone. Using both would double-log the same action.
 */
@ApiTags('agents')
@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @RequirePermission(PERMISSIONS.AGENTS_CREATE)
  @ApiOperation({ summary: 'Create a new voice agent.' })
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
}
