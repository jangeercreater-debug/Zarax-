import { Controller, Get, Post, Patch, Delete, Body, Inject } from '@nestjs/common';
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
    @Body() body: { name?: string; logoUrl?: string; industry?: string; timezone?: string; language?: string; companyUrl?: string },
  ): Promise<Record<string, unknown>> {
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.logoUrl !== undefined) data.logoUrl = body.logoUrl;
    if (body.industry !== undefined) data.industry = body.industry;
    if (body.timezone !== undefined) data.timezone = body.timezone;
    if (body.language !== undefined) data.language = body.language;
    if (body.companyUrl !== undefined) data.companyUrl = body.companyUrl;

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
      logoUrl: tenant.logoUrl,
      industry: tenant.industry,
      timezone: tenant.timezone,
      language: tenant.language,
      companyUrl: tenant.companyUrl,
    };
  }

  @Post('create')
  @ApiOperation({ summary: 'Create a new workspace.' })
  async createWorkspace(
    @CurrentPrincipal() principal: Principal,
    @Body() body: { name: string; slug: string; industry?: string; timezone?: string; language?: string },
  ): Promise<Record<string, unknown>> {
    const existing = await this.prisma.tenant.findUnique({ where: { slug: body.slug } });
    if (existing) return { error: "Workspace URL already taken" };

    const tenant = await this.prisma.tenant.create({
      data: {
        name: body.name,
        slug: body.slug,
        industry: body.industry ?? null,
        timezone: body.timezone ?? "UTC",
        language: body.language ?? "en",
      },
    });

    await this.prisma.tenantMembership.create({
      data: {
        tenantId: tenant.id,
        userId: principal.id,
        role: "owner" as never,
      },
    });

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
    };
  }

  @RequirePermission(PERMISSIONS.TENANT_MANAGE_BILLING)
  @Delete('me')
  @ApiOperation({ summary: 'Delete workspace (soft delete).' })
  async deleteWorkspace(
    @CurrentPrincipal() principal: Principal,
  ): Promise<Record<string, unknown>> {
    await this.prisma.tenant.update({
      where: { id: principal.tenantId },
      data: { deletedAt: new Date(), status: "SUSPENDED" as never },
    });

    return { deleted: true, message: "Workspace has been deactivated. Data will be retained for 30 days." };
  }

  @Get('list')
  @ApiOperation({ summary: 'List all workspaces the user belongs to.' })
  async listWorkspaces(
    @CurrentPrincipal() principal: Principal,
  ): Promise<Record<string, unknown>> {
    const memberships = await this.prisma.tenantMembership.findMany({
      where: { userId: principal.id },
      include: {
        tenant: {
          select: { id: true, name: true, slug: true, plan: true, status: true, logoUrl: true, createdAt: true },
        },
      },
    });

    const workspaces = memberships.map(m => ({
      id: m.tenant.id,
      name: m.tenant.name,
      slug: m.tenant.slug,
      plan: m.tenant.plan,
      status: m.tenant.status,
      logoUrl: m.tenant.logoUrl,
      role: m.role as string,
      joinedAt: m.createdAt.toISOString(),
    }));

    return { workspaces, total: workspaces.length };
  }

  @RequirePermission(PERMISSIONS.TENANT_MANAGE_BILLING)
  @Get('me/stats')
  @ApiOperation({ summary: 'Workspace statistics.' })
  async workspaceStats(@CurrentPrincipal() principal: Principal): Promise<Record<string, unknown>> {
    const tenantId = principal.tenantId;

    const [members, agents, calls, documents, apiKeys, memories] = await Promise.all([
      this.prisma.tenantMembership.count({ where: { tenantId } }),
      this.prisma.agent.count({ where: { tenantId } }),
      this.prisma.call.count({ where: { tenantId } }),
      this.prisma.knowledgeBaseDocument.count({ where: { tenantId } }).catch(() => 0),
      this.prisma.apiKey.count({ where: { tenantId } }),
      this.prisma.userMemory.count({ where: { tenantId } }).catch(() => 0),
    ]);

    return { members, agents, calls, documents, apiKeys, memories };
  }
}
