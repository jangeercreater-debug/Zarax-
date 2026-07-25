import { Controller, Get, Inject } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentPrincipal } from "@zarax/shared-auth";
import { PRISMA_CLIENT, type PrismaClient } from "@zarax/database";
import type { Principal } from "@zarax/shared-types";

@ApiTags("stats")
@Controller("stats")
export class StatsController {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  @ApiOperation({ summary: "Dashboard statistics for the current tenant." })
  @Get()
  async getStats(@CurrentPrincipal() principal: Principal) {
    const tenantId = principal.tenantId;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalCalls,
      recentCalls,
      activeCalls,
      totalAgents,
      activeAgents,
      totalDocuments,
    ] = await Promise.all([
      this.prisma.call.count({ where: { tenantId } }),
      this.prisma.call.count({ where: { tenantId, startedAt: { gte: thirtyDaysAgo } } }),
      this.prisma.call.count({ where: { tenantId, endedAt: null } }),
      this.prisma.agent.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.agent.count({ where: { tenantId, isActive: true, deletedAt: null } }),
      this.prisma.knowledgeBaseDocument.count({ where: { tenantId } }),
    ]);

    return {
      totalCalls,
      recentCalls,
      activeCalls,
      totalAgents,
      activeAgents,
      totalDocuments,
    };
  }
}
