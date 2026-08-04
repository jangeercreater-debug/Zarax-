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
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalCalls, activeCalls, todayCalls, weekCalls, monthCalls, failedCalls,
      totalAgents, publishedAgents, totalDocuments, totalMemories,
      totalMembers, totalApiKeys, avgDuration, totalDuration,
      monthlyUsage, recentCalls, recentErrors, dailyStats,
    ] = await Promise.all([
      this.prisma.call.count({ where: { tenantId } }),
      this.prisma.call.count({ where: { tenantId, endedAt: null } }),
      this.prisma.call.count({ where: { tenantId, startedAt: { gte: today } } }),
      this.prisma.call.count({ where: { tenantId, startedAt: { gte: weekAgo } } }),
      this.prisma.call.count({ where: { tenantId, startedAt: { gte: monthStart } } }),
      this.prisma.call.count({ where: { tenantId, endReason: { in: ["error", "failed"] } } }),
      this.prisma.agent.count({ where: { tenantId } }),
      this.prisma.agent.count({ where: { tenantId, isActive: true } }),
      this.prisma.knowledgeBaseDocument.count({ where: { tenantId } }).catch(() => 0),
      this.prisma.userMemory.count({ where: { tenantId } }).catch(() => 0),
      this.prisma.tenantMembership.count({ where: { tenantId } }),
      this.prisma.apiKey.count({ where: { tenantId, revokedAt: null } }),
      this.prisma.call.aggregate({ where: { tenantId, durationMs: { not: null } }, _avg: { durationMs: true } }),
      this.prisma.call.aggregate({ where: { tenantId, durationMs: { not: null } }, _sum: { durationMs: true } }),
      this.prisma.usageEvent.aggregate({
        where: { tenantId, occurredAt: { gte: monthStart } },
        _sum: { costUsd: true },
      }).catch(() => ({ _sum: { costUsd: null } })),
      this.prisma.call.findMany({
        where: { tenantId }, orderBy: { startedAt: "desc" }, take: 5,
        select: { id: true, agentId: true, startedAt: true, endedAt: true, durationMs: true, endReason: true },
      }),
      this.prisma.call.findMany({
        where: { tenantId, endReason: { in: ["error", "failed"] } },
        orderBy: { startedAt: "desc" }, take: 5,
        select: { id: true, agentId: true, startedAt: true, endReason: true },
      }),
      this.getLast7DaysCalls(tenantId),
    ]);

    const totalMinutes = Math.round((totalDuration._sum.durationMs ?? 0) / 60000);
    const monthlyCost = Math.round((monthlyUsage._sum.costUsd ?? 0) * 100) / 100;
    const successRate = totalCalls > 0 ? Math.round(((totalCalls - failedCalls) / totalCalls) * 100) : 100;

    return {
      overview: {
        totalCalls, activeCalls, todayCalls, weekCalls, monthCalls, failedCalls, successRate,
        totalAgents, publishedAgents, totalDocuments, totalMemories, totalMembers, totalApiKeys,
        avgDurationMs: Math.round(avgDuration._avg.durationMs ?? 0), totalMinutes, monthlyCost,
      },
      recentCalls,
      recentErrors,
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
      results.push({ date: start.toISOString().split("T")[0] ?? "", count });
    }
    return results;
  }
}
