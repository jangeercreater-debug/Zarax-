import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentPrincipal, RequirePermission } from "@zarax/shared-auth";
import { PRISMA_CLIENT, type PrismaClient } from "@zarax/database";
import { PERMISSIONS, type Principal } from "@zarax/shared-types";

@ApiTags("team")
@Controller("team")
export class TeamController {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  @RequirePermission(PERMISSIONS.TENANT_MANAGE_BILLING)
  @ApiOperation({ summary: "List all members of the current tenant." })
  @Get("members")
  async listMembers(@CurrentPrincipal() principal: Principal) {
    const members = await this.prisma.tenantMembership.findMany({
      where: { tenantId: principal.tenantId },
      include: { user: { select: { id: true, email: true, fullName: true } } },
      orderBy: { createdAt: "asc" },
    });
    return members.map(m => ({
      id: m.id,
      userId: m.userId,
      email: m.user.email,
      fullName: m.user.fullName,
      role: m.role,
      joinedAt: m.createdAt,
    }));
  }

  @RequirePermission(PERMISSIONS.TENANT_MANAGE_BILLING)
  @ApiOperation({ summary: "Update a member role." })
  @HttpCode(HttpStatus.OK)
  @Post("members/:memberId/role")
  async updateRole(
    @CurrentPrincipal() principal: Principal,
    @Param("memberId") memberId: string,
    @Body() dto: { role: string },
  ) {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { id: memberId, tenantId: principal.tenantId },
    });
    if (!membership) return { success: false, error: "Member not found" };
    await this.prisma.tenantMembership.update({
      where: { id: memberId },
      data: { role: dto.role as "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" },
    });
    return { success: true };
  }

  @RequirePermission(PERMISSIONS.TENANT_MANAGE_BILLING)
  @ApiOperation({ summary: "Remove a member from the tenant." })
  @HttpCode(HttpStatus.OK)
  @Delete("members/:memberId")
  async removeMember(
    @CurrentPrincipal() principal: Principal,
    @Param("memberId") memberId: string,
  ) {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { id: memberId, tenantId: principal.tenantId },
    });
    if (!membership) return { success: false, error: "Member not found" };
    if (membership.role === "OWNER") return { success: false, error: "Cannot remove workspace owner" };
    await this.prisma.tenantMembership.delete({ where: { id: memberId } });
    return { success: true };
  }
}
