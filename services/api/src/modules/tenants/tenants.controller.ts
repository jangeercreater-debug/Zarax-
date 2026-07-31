import { Controller, Get, Patch, Body, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal, RequirePermission } from '@zarax/shared-auth';
import { PRISMA_CLIENT, type PrismaClient } from '@zarax/database';
import { PERMISSIONS, type Principal } from '@zarax/shared-types';

import { TenantsService } from './tenants.service';
import type { TenantResponseDto } from './dto/tenant-response.dto';

@ApiTags('tenants')
@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current tenant details.' })
  async getCurrentTenant(@CurrentPrincipal() principal: Principal): Promise<TenantResponseDto> {
    return this.tenantsService.getCurrentTenant(principal.tenantId);
  }

  @RequirePermission(PERMISSIONS.TENANT_MANAGE_BILLING)
  @Patch('me')
  @ApiOperation({ summary: 'Update workspace settings.' })
  async updateWorkspace(
    @CurrentPrincipal() principal: Principal,
    @Body() body: { name?: string; timezone?: string; language?: string; companyUrl?: string },
  ): Promise<Record<string, unknown>> {
    const data: Record<string, unknown> = {};
    if (body.name) data.name = body.name;

    const tenant = await this.prisma.tenant.update({
      where: { id: principal.tenantId },
      data,
    });

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      plan: tenant.plan,
      status: tenant.status,
    };
  }

  @RequirePermission(PERMISSIONS.TENANT_MANAGE_BILLING)
  @Get('me/stats')
  @ApiOperation({ summary: 'Workspace statistics.' })
  async workspaceStats(@CurrentPrincipal() principal: Principal): Promise<Record<string, unknown>> {
    const tenantId = principal.tenantId;

    const [members, agents, calls, documents, apiKeys] = await Promise.all([
      this.prisma.tenantMembership.count({ where: { tenantId } }),
      this.prisma.agent.count({ where: { tenantId } }),
      this.prisma.call.count({ where: { tenantId } }),
      this.prisma.knowledgeBaseDocument.count({ where: { tenantId } }).catch(() => 0),
      this.prisma.apiKey.count({ where: { tenantId } }),
    ]);

    return {
      members,
      agents,
      calls,
      documents,
      apiKeys,
    };
  }
}
