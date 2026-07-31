import { Controller, Get, Inject } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentPrincipal, RequirePermission } from "@zarax/shared-auth";
import { PRISMA_CLIENT, type PrismaClient } from "@zarax/database";
import { PERMISSIONS, type Principal } from "@zarax/shared-types";

const PLANS = [
  { id: "free", name: "Free", price: 0, voiceMinutes: 100, agents: 2, documents: 10, apiKeys: 2, members: 2, features: ["Basic voice agents", "Community support"] },
  { id: "pro", name: "Pro", price: 49, voiceMinutes: 2000, agents: 10, documents: 100, apiKeys: 10, members: 10, features: ["Advanced voice agents", "Priority support", "Analytics", "Custom voices", "API access"] },
  { id: "business", name: "Business", price: 199, voiceMinutes: 10000, agents: 50, documents: 500, apiKeys: 50, members: 50, features: ["Enterprise voice agents", "Dedicated support", "Advanced analytics", "Custom integrations", "SSO", "SLA"] },
  { id: "enterprise", name: "Enterprise", price: -1, voiceMinutes: -1, agents: -1, documents: -1, apiKeys: -1, members: -1, features: ["Unlimited everything", "24/7 dedicated support", "Custom deployment", "White label", "On-premise option"] },
];

@ApiTags("billing")
@Controller("billing")
export class BillingController {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  @RequirePermission(PERMISSIONS.TENANT_MANAGE_BILLING)
  @ApiOperation({ summary: "Get current plan and usage." })
  @Get("overview")
  async overview(@CurrentPrincipal() principal: Principal): Promise<Record<string, unknown>> {
    const tenantId = principal.tenantId;
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [callsThisMonth, totalDurationMs, agentCount, documentCount, apiKeyCount, memberCount] = await Promise.all([
      this.prisma.call.count({ where: { tenantId, startedAt: { gte: monthStart } } }),
      this.prisma.call.aggregate({ where: { tenantId, startedAt: { gte: monthStart }, durationMs: { not: null } }, _sum: { durationMs: true } }),
      this.prisma.agent.count({ where: { tenantId } }),
      this.prisma.knowledgeBaseDocument.count({ where: { tenantId } }).catch(() => 0),
      this.prisma.apiKey.count({ where: { tenantId } }),
      this.prisma.tenantMembership.count({ where: { tenantId } }),
    ]);

    const voiceMinutesUsed = Math.round((totalDurationMs._sum.durationMs ?? 0) / 60000);
    const currentPlan = PLANS.find((p) => p.id === tenant.plan.toLowerCase()) ?? PLANS[0];

    return {
      currentPlan: {
        id: currentPlan?.id,
        name: currentPlan?.name,
        price: currentPlan?.price,
      },
      usage: {
        voiceMinutes: { used: voiceMinutesUsed, limit: currentPlan?.voiceMinutes ?? 100 },
        agents: { used: agentCount, limit: currentPlan?.agents ?? 2 },
        documents: { used: documentCount, limit: currentPlan?.documents ?? 10 },
        apiKeys: { used: apiKeyCount, limit: currentPlan?.apiKeys ?? 2 },
        members: { used: memberCount, limit: currentPlan?.members ?? 2 },
        calls: { used: callsThisMonth },
      },
      billingPeriod: { start: monthStart.toISOString(), end: new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).toISOString() },
    };
  }

  @RequirePermission(PERMISSIONS.TENANT_MANAGE_BILLING)
  @ApiOperation({ summary: "List available plans." })
  @Get("plans")
  async plans(): Promise<Record<string, unknown>> {
    return { plans: PLANS };
  }
}
