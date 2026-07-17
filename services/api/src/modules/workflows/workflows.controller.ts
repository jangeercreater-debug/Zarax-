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

import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { ExecuteWorkflowDto } from './dto/execute-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import type {
  WorkflowExecutionResponseDto,
  WorkflowResponseDto,
  WorkflowVersionResponseDto,
} from './dto/workflow-response.dto';
import { WorkflowsService } from './workflows.service';

/**
 * Audit logging for every mutation here happens inside WorkflowsService's
 * auditLogService.record() calls, not via the declarative @Audited() decorator —
 * same reasoning as AgentsController (the service layer has richer context, e.g. the
 * target rollback version or the triggered execution id).
 */
@ApiTags('workflows')
@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @RequirePermission(PERMISSIONS.WORKFLOWS_CREATE)
  @ApiOperation({ summary: 'Create a new workflow.' })
  @Post()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateWorkflowDto,
  ): Promise<WorkflowResponseDto> {
    return this.workflowsService.create(principal.tenantId, principal, dto);
  }

  @RequirePermission(PERMISSIONS.WORKFLOWS_READ)
  @ApiOperation({ summary: "List the tenant's workflows." })
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<WorkflowResponseDto[]> {
    return this.workflowsService.list(principal.tenantId);
  }

  @RequirePermission(PERMISSIONS.WORKFLOWS_READ)
  @ApiOperation({ summary: 'Get one workflow.' })
  @Get(':id')
  async get(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ): Promise<WorkflowResponseDto> {
    return this.workflowsService.get(principal.tenantId, id);
  }

  @RequirePermission(PERMISSIONS.WORKFLOWS_UPDATE)
  @ApiOperation({ summary: 'Update a workflow. A definition change creates a new version automatically.' })
  @Patch(':id')
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowDto,
  ): Promise<WorkflowResponseDto> {
    return this.workflowsService.update(principal.tenantId, principal, id, dto);
  }

  @RequirePermission(PERMISSIONS.WORKFLOWS_DELETE)
  @ApiOperation({ summary: 'Soft-delete a workflow.' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(@CurrentPrincipal() principal: Principal, @Param('id') id: string): Promise<void> {
    await this.workflowsService.remove(principal.tenantId, principal, id);
  }

  @RequirePermission(PERMISSIONS.WORKFLOWS_UPDATE)
  @ApiOperation({ summary: 'Publish — requires at least one trigger node and one end node.' })
  @Post(':id/publish')
  async publish(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ): Promise<WorkflowResponseDto> {
    return this.workflowsService.publish(principal.tenantId, principal, id);
  }

  @RequirePermission(PERMISSIONS.WORKFLOWS_UPDATE)
  @ApiOperation({ summary: 'Revert to draft.' })
  @Post(':id/unpublish')
  async unpublish(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ): Promise<WorkflowResponseDto> {
    return this.workflowsService.unpublish(principal.tenantId, principal, id);
  }

  @RequirePermission(PERMISSIONS.WORKFLOWS_READ)
  @ApiOperation({ summary: 'List every version snapshot, newest first.' })
  @Get(':id/versions')
  async listVersions(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ): Promise<WorkflowVersionResponseDto[]> {
    return this.workflowsService.listVersions(principal.tenantId, id);
  }

  @RequirePermission(PERMISSIONS.WORKFLOWS_UPDATE)
  @ApiOperation({ summary: 'Roll back to a previous version — creates a new version matching the target.' })
  @Post(':id/versions/:version/rollback')
  async rollback(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Param('version', ParseIntPipe) version: number,
  ): Promise<WorkflowResponseDto> {
    return this.workflowsService.rollback(principal.tenantId, principal, id, version);
  }

  @RequirePermission(PERMISSIONS.WORKFLOWS_EXECUTE)
  @RateLimit({ limit: 20, windowMs: 60_000 })
  @ApiOperation({ summary: 'Trigger a workflow run (works for drafts too — this is "Test Workflow").' })
  @Post(':id/execute')
  async execute(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() dto: ExecuteWorkflowDto,
  ): Promise<WorkflowExecutionResponseDto> {
    return this.workflowsService.execute(principal.tenantId, principal, id, dto);
  }

  @RequirePermission(PERMISSIONS.WORKFLOWS_READ)
  @ApiOperation({ summary: 'List execution history for a workflow, newest first.' })
  @Get(':id/executions')
  async listExecutions(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ): Promise<WorkflowExecutionResponseDto[]> {
    return this.workflowsService.listExecutions(principal.tenantId, id);
  }

  @RequirePermission(PERMISSIONS.WORKFLOWS_READ)
  @ApiOperation({ summary: 'Get one execution, including its per-node result log.' })
  @Get(':id/executions/:executionId')
  async getExecution(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Param('executionId') executionId: string,
  ): Promise<WorkflowExecutionResponseDto> {
    return this.workflowsService.getExecution(principal.tenantId, id, executionId);
  }
}
