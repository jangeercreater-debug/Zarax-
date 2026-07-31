import { Controller, Get, Inject } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentPrincipal, RequirePermission } from "@zarax/shared-auth";
import { PRISMA_CLIENT, type PrismaClient } from "@zarax/database";
import { PERMISSIONS, type Principal } from "@zarax/shared-types";

@ApiTags("dashboard")
@Controller("dashboard")
export class DashboardController {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  @RequirePermission(PERMISSIONS.CALLS_READ)
  @ApiOperation({ summary: "Complete dashboard stats." })
  @Get("stats")
  async stats(@CurrentPrincipal() principal: Principal): Promise<Record<string, unknown>> {
    const tenantId = principal.tenantId;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalCalls,
      activeCalls,
      todayCalls,
      weekCalls,
      monthCalls,
      totalAgents,
      publishedAgents,
      totalDocuments,
      totalMemories,
      avgDuration,
      recentCalls,
      dailyStats,
    ] = await Promise.all([
      this.prisma.call.count({ where: { tenantId } }),
      this.prisma.call.count({ where: { tenantId, endedAt: null } }),
      this.prisma.call.count({ where: { tenantId, startedAt: { gte: today } } }),
      this.prisma.call.count({ where: { tenantId, startedAt: { gte: weekAgo } } }),
      this.prisma.call.count({ where: { tenantId, startedAt: { gte: monthAgo } } }),
      this.prisma.agent.count({ where: { tenantId } }),
      this.prisma.agent.count({ where: { tenantId, isActive: true } }),
      this.prisma.document.count({ where: { tenantId } }).catch(() => 0),
      this.prisma.userMemory.count({ where: { tenantId } }).catch(() => 0),
      this.prisma.call.aggregate({
        where: { tenantId, durationMs: { not: null } },
        _avg: { durationMs: true },
      }),
      this.prisma.call.findMany({
        where: { tenantId },
        orderBy: { startedAt: "desc" },
        take: 5,
        select: { id: true, agentId: true, startedAt: true, endedAt: true, durationMs: true, endReason: true },
      }),
      this.getLast7DaysCalls(tenantId),
    ]);

    const totalMinutes = await this.prisma.call.aggregate({
      where: { tenantId, durationMs: { not: null } },
      _sum: { durationMs: true },
    });

    return {
      overview: {
        totalCalls,
        activeCalls,
        todayCalls,
        weekCalls,
        monthCalls,
        totalAgents,
        publishedAgents,
        totalDocuments,
        totalMemories,
        avgDurationMs: Math.round(avgDuration._avg.durationMs ?? 0),
        totalMinutes: Math.round((totalMinutes._sum.durationMs ?? 0) / 60000),
      },
      recentCalls,
      dailyStats,
    };
  }

  private async getLast7DaysCalls(tenantId: string): Promise<Array<{ date: string; count: number }>> {
    const results: Array<{ date: string; count: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      const count = await this.prisma.call.count({
        where: { tenantId, startedAt: { gte: start, lt: end } },
      });
      results.push({
        date: start.toISOString().split("T")[0] ?? "",
        count,
      });
    }
    return results;
  }
}
