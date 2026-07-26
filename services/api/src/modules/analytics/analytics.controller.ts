import { Controller, Get, Inject, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentPrincipal, RequirePermission } from "@zarax/shared-auth";
import { PRISMA_CLIENT, type PrismaClient } from "@zarax/database";
import { PERMISSIONS, type Principal } from "@zarax/shared-types";

@ApiTags("analytics")
@Controller("analytics")
export class AnalyticsController {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  @RequirePermission(PERMISSIONS.CALLS_READ)
  @ApiOperation({ summary: "Call analytics and trends." })
  @Get("calls")
  async callAnalytics(
    @CurrentPrincipal() principal: Principal,
    @Query("days") days?: string,
  ) {
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
      }),
      this.prisma.call.groupBy({
        by: ["agentId"],
        where: { tenantId, startedAt: { gte: since } },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 5,
      }),
    ]);

    const agentIds = byAgent.map(b => b.agentId);
    const agents = await this.prisma.agent.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, name: true },
    });
    const agentMap = Object.fromEntries(agents.map(a => [a.id, a.name]));

    return {
      period: { days: d, since: since.toISOString() },
      calls: {
        total,
        completed,
        active,
        failed: total - completed - active,
        avgDurationMs: Math.round(avgDuration._avg.durationMs ?? 0),
      },
      topAgents: byAgent.map(b => ({
        agentId: b.agentId,
        agentName: agentMap[b.agentId] ?? "Unknown",
        callCount: b._count.id,
      })),
    };
  }

  @RequirePermission(PERMISSIONS.CALLS_READ)
  @ApiOperation({ summary: "Usage analytics (LLM, STT, TTS)." })
  @Get("usage")
  async usageAnalytics(
    @CurrentPrincipal() principal: Principal,
    @Query("days") days?: string,
  ) {
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
}
