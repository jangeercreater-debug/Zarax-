import { Controller, Get, Inject, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentPrincipal, RequirePermission } from "@zarax/shared-auth";
import { PRISMA_CLIENT, type PrismaClient } from "@zarax/database";
import { PERMISSIONS, type Principal } from "@zarax/shared-types";

@ApiTags("audit-logs")
@Controller("audit-logs")
export class AuditLogsController {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  @RequirePermission(PERMISSIONS.AUDIT_LOGS_READ)
  @ApiOperation({ summary: "List audit log entries with filters." })
  @Get()
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query("action") action?: string,
    @Query("actorId") actorId?: string,
    @Query("resourceType") resourceType?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ): Promise<{ items: Record<string, unknown>[]; total: number; page: number; totalPages: number }> {
    const p = Math.max(1, Number(page ?? 1));
    const l = Math.min(Number(limit ?? 25), 100);
    const where: Record<string, unknown> = { tenantId: principal.tenantId };
    if (action) where.action = { contains: action, mode: "insensitive" };
    if (actorId) where.actorId = actorId;
    if (resourceType) where.resourceType = { contains: resourceType, mode: "insensitive" };
    if (from || to) {
      const createdAt: Record<string, unknown> = {};
      if (from) createdAt.gte = new Date(from);
      if (to) createdAt.lte = new Date(to);
      where.createdAt = createdAt;
    }

    const [items, total] = await Promise.all([
      this.prisma.auditLogEntry.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: l,
        skip: (p - 1) * l,
      }),
      this.prisma.auditLogEntry.count({ where }),
    ]);

    return {
      items: items as unknown as Record<string, unknown>[],
      total,
      page: p,
      totalPages: Math.ceil(total / l),
    };
  }

  @RequirePermission(PERMISSIONS.AUDIT_LOGS_READ)
  @ApiOperation({ summary: "Audit log statistics." })
  @Get("stats")
  async stats(@CurrentPrincipal() principal: Principal): Promise<Record<string, unknown>> {
    const tenantId = principal.tenantId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [total, todayCount, weekCount, topActions] = await Promise.all([
      this.prisma.auditLogEntry.count({ where: { tenantId } }),
      this.prisma.auditLogEntry.count({ where: { tenantId, createdAt: { gte: today } } }),
      this.prisma.auditLogEntry.count({ where: { tenantId, createdAt: { gte: weekAgo } } }),
      this.prisma.auditLogEntry.groupBy({
        by: ["action"],
        where: { tenantId },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 5,
      }),
    ]);

    return {
      total,
      todayCount,
      weekCount,
      topActions: topActions.map(a => ({ action: a.action, count: a._count.id })),
    };
  }

  @RequirePermission(PERMISSIONS.AUDIT_LOGS_READ)
  @ApiOperation({ summary: "Export audit logs as CSV." })
  @Get("export")
  async exportCsv(
    @CurrentPrincipal() principal: Principal,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ): Promise<Record<string, unknown>> {
    const where: Record<string, unknown> = { tenantId: principal.tenantId };
    if (from || to) {
      const createdAt: Record<string, unknown> = {};
      if (from) createdAt.gte = new Date(from);
      if (to) createdAt.lte = new Date(to);
      where.createdAt = createdAt;
    }

    const logs = await this.prisma.auditLogEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    const header = "id,action,actorId,actorType,resourceType,resourceId,ipAddress,createdAt";
    const rows = logs.map((l: Record<string, unknown>) =>
      [l.id, l.action, l.actorId, l.actorType, l.resourceType ?? "", l.resourceId ?? "", l.ipAddress ?? "", (l.createdAt as Date).toISOString()].join(",")
    );
    const csv = [header, ...rows].join("\n");

    return { csv, totalRows: logs.length };
  }
}
