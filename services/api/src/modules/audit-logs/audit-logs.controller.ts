import { Controller, Get, Inject, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentPrincipal, RequirePermission } from "@zarax/shared-auth";
import { PRISMA_CLIENT, type PrismaClient } from "@zarax/database";
import { PERMISSIONS, type Principal } from "@zarax/shared-types";

@ApiTags("audit-logs")
@Controller("audit-logs")
export class AuditLogsController {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  @RequirePermission(PERMISSIONS.TENANT_MANAGE_BILLING)
  @ApiOperation({ summary: "List audit log entries for the tenant." })
  @Get()
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query("action") action?: string,
    @Query("actorId") actorId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ): Promise<{ items: Record<string, unknown>[]; total: number; page: number; totalPages: number }> {
    const p = Math.max(1, Number(page ?? 1));
    const l = Math.min(Number(limit ?? 20), 100);
    const where: Record<string, unknown> = { tenantId: principal.tenantId };
    if (action) where.action = { contains: action, mode: "insensitive" };
    if (actorId) where.actorId = actorId;

    const [items, total] = await Promise.all([
      this.prisma.auditLogEntry.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: l,
        skip: (p - 1) * l,
      }),
      this.prisma.auditLogEntry.count({ where }),
    ]);

    return { items, total, page: p, totalPages: Math.ceil(total / l) };
  }
}
