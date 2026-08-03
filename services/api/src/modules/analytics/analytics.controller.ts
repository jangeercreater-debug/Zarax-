import { Controller, Get, Inject, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentPrincipal, RequirePermission } from "@zarax/shared-auth";
import { PRISMA_CLIENT, type PrismaClient } from "@zarax/database";
import { PERMISSIONS, type Principal } from "@zarax/shared-types";

@ApiTags("analytics")
@Controller("analytics")
export class AnalyticsController {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  @RequirePermission(PERMISSIONS.ANALYTICS_READ)
  @ApiOperation({ summary: "Call analytics and trends." })
  @Get("calls")
  async callAnalytics(
    @CurrentPrincipal() principal: Principal,
    @Query("days") days?: string,
  ): Promise<Record<string, unknown>> {
    const d = Math.min(Number(days ?? 30), 90);
    const since = new Date(Date.now() - d * 24 * 60 * 60 * 1000);
    const tenantId = principal.tenantId;

    const [total, completed, active, avgDuration, byAgent] = await Promise.all([
      this.prisma.call.count({ where: { tenantId, startedAt: { gte: since } } }),
      this.prisma.call.count({ where: { tenantId, startedAt: { gte: since }, endedAt: { not: null } } }),
      this.prisma.call.count({ where: { tenantId, endedAt: null } }),
      this.prisma.call.aggregate({
        where: { tenantId, startedAt: { gte: since }, durationMs: { not: null } },
        _avg: { durationMs: true },
        _max: { durationMs: true },
        _min: { durationMs: true },
        _sum: { durationMs: true },
      }),
      this.prisma.call.groupBy({
        by: ["agentId"],
        where: { tenantId, startedAt: { gte: since } },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 10,
      }),
    ]);

    const agentIds = byAgent.map(b => b.agentId);
    const agents = await this.prisma.agent.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, name: true },
    });
    const agentMap = Object.fromEntries(agents.map(a => [a.id, a.name]));

    const failed = total - completed - active;
    const successRate = total > 0 ? Math.round((completed / total) * 100) : 100;
    const totalMinutes = Math.round((avgDuration._sum.durationMs ?? 0) / 60000);

    return {
      period: { days: d, since: since.toISOString() },
      calls: {
        total,
        completed,
        active,
        failed,
        successRate,
        avgDurationMs: Math.round(avgDuration._avg.durationMs ?? 0),
        maxDurationMs: avgDuration._max.durationMs ?? 0,
        minDurationMs: avgDuration._min.durationMs ?? 0,
        totalMinutes,
      },
      topAgents: byAgent.map(b => ({
        agentId: b.agentId,
        agentName: agentMap[b.agentId] ?? "Unknown",
        callCount: b._count.id,
      })),
    };
  }

  @RequirePermission(PERMISSIONS.ANALYTICS_READ)
  @ApiOperation({ summary: "Daily call trends." })
  @Get("trends")
  async dailyTrends(
    @CurrentPrincipal() principal: Principal,
    @Query("days") days?: string,
  ): Promise<Record<string, unknown>> {
    const d = Math.min(Number(days ?? 14), 90);
    const tenantId = principal.tenantId;
    const results: Array<{ date: string; calls: number; minutes: number }> = [];

    for (let i = d - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

      const [count, duration] = await Promise.all([
        this.prisma.call.count({ where: { tenantId, startedAt: { gte: start, lt: end } } }),
        this.prisma.call.aggregate({
          where: { tenantId, startedAt: { gte: start, lt: end }, durationMs: { not: null } },
          _sum: { durationMs: true },
        }),
      ]);

      results.push({
        date: start.toISOString().split("T")[0] ?? "",
        calls: count,
        minutes: Math.round((duration._sum.durationMs ?? 0) / 60000),
      });
    }

    return { period: { days: d }, trends: results };
  }

  @RequirePermission(PERMISSIONS.ANALYTICS_READ)
  @ApiOperation({ summary: "Usage analytics (LLM, STT, TTS)." })
  @Get("usage")
  async usageAnalytics(
    @CurrentPrincipal() principal: Principal,
    @Query("days") days?: string,
  ): Promise<Record<string, unknown>> {
    const d = Math.min(Number(days ?? 30), 90);
    const since = new Date(Date.now() - d * 24 * 60 * 60 * 1000);
    const tenantId = principal.tenantId;

    const usage = await this.prisma.usageEvent.groupBy({
      by: ["category", "provider", "unit"],
      where: { tenantId, occurredAt: { gte: since } },
      _sum: { quantity: true, costUsd: true },
      _count: { id: true },
    });

    const totalCost = usage.reduce((sum, u) => sum + (u._sum.costUsd ?? 0), 0);

    return {
      period: { days: d, since: since.toISOString() },
      totalCostUsd: Math.round(totalCost * 100) / 100,
      breakdown: usage.map(u => ({
        category: u.category,
        provider: u.provider,
        unit: u.unit,
        quantity: u._sum.quantity ?? 0,
        costUsd: Math.round((u._sum.costUsd ?? 0) * 100) / 100,
        events: u._count.id,
      })),
    };
  }

  @RequirePermission(PERMISSIONS.ANALYTICS_READ)
  @ApiOperation({ summary: "Export analytics as CSV." })
  @Get("export")
  async exportCsv(
    @CurrentPrincipal() principal: Principal,
    @Query("days") days?: string,
  ): Promise<Record<string, unknown>> {
    const d = Math.min(Number(days ?? 30), 90);
    const since = new Date(Date.now() - d * 24 * 60 * 60 * 1000);
    const tenantId = principal.tenantId;

    const calls = await this.prisma.call.findMany({
      where: { tenantId, startedAt: { gte: since } },
      orderBy: { startedAt: "desc" },
      select: { id: true, agentId: true, startedAt: true, endedAt: true, durationMs: true, endReason: true },
      take: 1000,
    });

    const header = "id,agentId,startedAt,endedAt,durationMs,endReason";
    const rows = calls.map(c =>
      [c.id, c.agentId, c.startedAt.toISOString(), c.endedAt?.toISOString() ?? "", c.durationMs ?? "", c.endReason ?? ""].join(",")
    );
    const csv = [header, ...rows].join("\n");

    return { csv, totalRows: calls.length };
  }

  @RequirePermission(PERMISSIONS.ANALYTICS_READ)
  @ApiOperation({ summary: "Top users by activity." })
  @Get("top-users")
  async topUsers(
    @CurrentPrincipal() principal: Principal,
    @Query("days") days?: string,
  ): Promise<Record<string, unknown>> {
    const d = Math.min(Number(days ?? 30), 90);
    const tenantId = principal.tenantId;

    const members = await this.prisma.tenantMembership.findMany({
      where: { tenantId },
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });

    const topUsers = members.map(m => ({
      userId: m.user.id,
      name: m.user.fullName ?? m.user.email,
      role: m.role as string,
    })).slice(0, 10);

    return { period: { days: d }, topUsers, totalMembers: members.length };
  }
}
