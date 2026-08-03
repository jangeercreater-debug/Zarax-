import { Controller, Get, Patch, Delete, Body, Param, Inject } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentPrincipal, RequirePermission } from "@zarax/shared-auth";
import { PRISMA_CLIENT, type PrismaClient } from "@zarax/database";
import { PERMISSIONS, type Principal } from "@zarax/shared-types";

@ApiTags("team")
@Controller("team")
export class TeamController {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  @RequirePermission(PERMISSIONS.TENANT_MANAGE_MEMBERS)
  @ApiOperation({ summary: "List team members." })
  @Get("members")
  async listMembers(@CurrentPrincipal() principal: Principal): Promise<Record<string, unknown>> {
    const memberships = await this.prisma.tenantMembership.findMany({
      where: { tenantId: principal.tenantId },
      include: { user: { select: { id: true, fullName: true, email: true, createdAt: true } } },
      orderBy: { createdAt: "asc" },
    });

    const members = memberships.map(m => ({
      id: m.user.id,
      fullName: m.user.fullName,
      email: m.user.email,
      role: m.role as string,
      joinedAt: m.createdAt.toISOString(),
      userCreatedAt: m.user.createdAt.toISOString(),
      isOwner: (m.role as string) === "OWNER",
      suspended: m.suspendedAt !== null,
      suspendedAt: m.suspendedAt?.toISOString() ?? null,
    }));

    return { members, total: members.length };
  }

  @RequirePermission(PERMISSIONS.TENANT_MANAGE_MEMBERS)
  @ApiOperation({ summary: "Update member role." })
  @Patch("members/:userId/role")
  async updateRole(
    @CurrentPrincipal() principal: Principal,
    @Param("userId") userId: string,
    @Body() body: { role: string },
  ): Promise<Record<string, unknown>> {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { tenantId: principal.tenantId, userId },
    });
    if (!membership) return { error: "Member not found" };
    if ((membership.role as string) === "OWNER") return { error: "Cannot change owner role" };

    await this.prisma.tenantMembership.updateMany({
      where: { tenantId: principal.tenantId, userId },
      data: { role: body.role as never },
    });

    return { updated: true, userId, role: body.role };
  }

  @RequirePermission(PERMISSIONS.TENANT_MANAGE_MEMBERS)
  @ApiOperation({ summary: "Suspend a member." })
  @Patch("members/:userId/suspend")
  async suspendMember(
    @CurrentPrincipal() principal: Principal,
    @Param("userId") userId: string,
  ): Promise<Record<string, unknown>> {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { tenantId: principal.tenantId, userId },
    });
    if (!membership) return { error: "Member not found" };
    if ((membership.role as string) === "OWNER") return { error: "Cannot suspend owner" };
    if (userId === principal.id) return { error: "Cannot suspend yourself" };

    await this.prisma.tenantMembership.updateMany({
      where: { tenantId: principal.tenantId, userId },
      data: { suspendedAt: new Date() },
    });

    return { suspended: true, userId };
  }

  @RequirePermission(PERMISSIONS.TENANT_MANAGE_MEMBERS)
  @ApiOperation({ summary: "Activate a suspended member." })
  @Patch("members/:userId/activate")
  async activateMember(
    @CurrentPrincipal() principal: Principal,
    @Param("userId") userId: string,
  ): Promise<Record<string, unknown>> {
    await this.prisma.tenantMembership.updateMany({
      where: { tenantId: principal.tenantId, userId },
      data: { suspendedAt: null },
    });

    return { activated: true, userId };
  }

  @RequirePermission(PERMISSIONS.TENANT_MANAGE_MEMBERS)
  @ApiOperation({ summary: "Remove member from team." })
  @Delete("members/:userId")
  async removeMember(
    @CurrentPrincipal() principal: Principal,
    @Param("userId") userId: string,
  ): Promise<Record<string, unknown>> {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { tenantId: principal.tenantId, userId },
    });
    if (!membership) return { error: "Member not found" };
    if ((membership.role as string) === "OWNER") return { error: "Cannot remove owner" };
    if (userId === principal.id) return { error: "Cannot remove yourself" };

    await this.prisma.tenantMembership.deleteMany({
      where: { tenantId: principal.tenantId, userId },
    });

    return { removed: true, userId };
  }

  @RequirePermission(PERMISSIONS.TENANT_MANAGE_MEMBERS)
  @ApiOperation({ summary: "Team statistics." })
  @Get("stats")
  async stats(@CurrentPrincipal() principal: Principal): Promise<Record<string, unknown>> {
    const tenantId = principal.tenantId;

    const [total, suspended, byRole] = await Promise.all([
      this.prisma.tenantMembership.count({ where: { tenantId } }),
      this.prisma.tenantMembership.count({ where: { tenantId, suspendedAt: { not: null } } }),
      this.prisma.tenantMembership.groupBy({
        by: ["role"],
        where: { tenantId },
        _count: { userId: true },
      }),
    ]);

    return {
      total,
      active: total - suspended,
      suspended,
      byRole: byRole.map(r => ({ role: r.role as string, count: r._count.userId })),
    };
  }
}
