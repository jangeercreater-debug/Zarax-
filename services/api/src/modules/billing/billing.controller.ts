import { Controller, Get, Post, Body, Inject } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentPrincipal, RequirePermission } from "@zarax/shared-auth";
import { PRISMA_CLIENT, type PrismaClient } from "@zarax/database";
import { PERMISSIONS, type Principal } from "@zarax/shared-types";

const PLANS = [
  { id: "free", name: "Free", price: 0, voiceMinutes: 100, agents: 2, documents: 10, apiKeys: 2, members: 2, storage: 100, aiTokens: 50000, features: ["Basic voice agents", "Community support"] },
  { id: "pro", name: "Pro", price: 49, voiceMinutes: 2000, agents: 10, documents: 100, apiKeys: 10, members: 10, storage: 1000, aiTokens: 500000, features: ["Advanced voice agents", "Priority support", "Analytics", "Custom voices", "API access", "Webhooks"] },
  { id: "business", name: "Business", price: 199, voiceMinutes: 10000, agents: 50, documents: 500, apiKeys: 50, members: 50, storage: 5000, aiTokens: 2000000, features: ["Enterprise voice agents", "Dedicated support", "Advanced analytics", "Custom integrations", "SSO", "SLA", "White label"] },
  { id: "enterprise", name: "Enterprise", price: -1, voiceMinutes: -1, agents: -1, documents: -1, apiKeys: -1, members: -1, storage: -1, aiTokens: -1, features: ["Unlimited everything", "24/7 dedicated support", "Custom deployment", "White label", "On-premise option", "Custom SLA"] },
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

    const [callsThisMonth, totalDurationMs, agentCount, documentCount, apiKeyCount, memberCount, memoryCount, usageEvents] = await Promise.all([
      this.prisma.call.count({ where: { tenantId, startedAt: { gte: monthStart } } }),
      this.prisma.call.aggregate({ where: { tenantId, startedAt: { gte: monthStart }, durationMs: { not: null } }, _sum: { durationMs: true } }),
      this.prisma.agent.count({ where: { tenantId } }),
      this.prisma.knowledgeBaseDocument.count({ where: { tenantId } }).catch(() => 0),
      this.prisma.apiKey.count({ where: { tenantId, revokedAt: null } }),
      this.prisma.tenantMembership.count({ where: { tenantId } }),
      this.prisma.userMemory.count({ where: { tenantId } }).catch(() => 0),
      this.prisma.usageEvent.aggregate({
        where: { tenantId, occurredAt: { gte: monthStart } },
        _sum: { quantity: true, costUsd: true },
      }).catch(() => ({ _sum: { quantity: null, costUsd: null } })),
    ]);

    const voiceMinutesUsed = Math.round((totalDurationMs._sum.durationMs ?? 0) / 60000);
    const currentPlan = PLANS.find((p) => p.id === tenant.plan.toLowerCase()) ?? PLANS[0];
    const aiTokensUsed = Math.round(usageEvents._sum.quantity ?? 0);
    const monthlyCost = Math.round((usageEvents._sum.costUsd ?? 0) * 100) / 100;

    return {
      currentPlan: { id: currentPlan?.id, name: currentPlan?.name, price: currentPlan?.price, features: currentPlan?.features },
      usage: {
        voiceMinutes: { used: voiceMinutesUsed, limit: currentPlan?.voiceMinutes ?? 100 },
        agents: { used: agentCount, limit: currentPlan?.agents ?? 2 },
        documents: { used: documentCount, limit: currentPlan?.documents ?? 10 },
        apiKeys: { used: apiKeyCount, limit: currentPlan?.apiKeys ?? 2 },
        members: { used: memberCount, limit: currentPlan?.members ?? 2 },
        storage: { used: memoryCount, limit: currentPlan?.storage ?? 100 },
        aiTokens: { used: aiTokensUsed, limit: currentPlan?.aiTokens ?? 50000 },
        calls: { used: callsThisMonth },
        monthlyCost,
      },
      billingPeriod: { start: monthStart.toISOString(), end: new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).toISOString() },
      credits: { balance: 0, autoRenewal: false },
      paymentMethods: [],
      invoices: [],
    };
  }

  @RequirePermission(PERMISSIONS.TENANT_MANAGE_BILLING)
  @ApiOperation({ summary: "List available plans." })
  @Get("plans")
  async plans(): Promise<Record<string, unknown>> {
    return { plans: PLANS };
  }

  @RequirePermission(PERMISSIONS.TENANT_MANAGE_BILLING)
  @ApiOperation({ summary: "Get invoices." })
  @Get("invoices")
  async invoices(): Promise<Record<string, unknown>> {
    return { invoices: [], message: "Connect Stripe to view invoices. Set STRIPE_SECRET_KEY." };
  }

  @RequirePermission(PERMISSIONS.TENANT_MANAGE_BILLING)
  @ApiOperation({ summary: "Get payment methods." })
  @Get("payment-methods")
  async paymentMethods(): Promise<Record<string, unknown>> {
    return { methods: [], message: "Connect Stripe to manage payment methods. Set STRIPE_SECRET_KEY." };
  }

  @RequirePermission(PERMISSIONS.TENANT_MANAGE_BILLING)
  @ApiOperation({ summary: "Buy credits." })
  @Post("buy-credits")
  async buyCredits(@Body() body: { amount: number }): Promise<Record<string, unknown>> {
    if (!process.env.STRIPE_SECRET_KEY) return { error: "Stripe not configured. Set STRIPE_SECRET_KEY.", checkoutUrl: null };
    return { message: "Stripe checkout session would be created here.", amount: body.amount, checkoutUrl: null };
  }

  @RequirePermission(PERMISSIONS.TENANT_MANAGE_BILLING)
  @ApiOperation({ summary: "Upgrade plan." })
  @Post("upgrade")
  async upgrade(@Body() body: { planId: string }): Promise<Record<string, unknown>> {
    if (!process.env.STRIPE_SECRET_KEY) return { error: "Stripe not configured. Set STRIPE_SECRET_KEY.", checkoutUrl: null };
    const plan = PLANS.find(p => p.id === body.planId);
    if (!plan) return { error: "Plan not found" };
    return { message: "Stripe checkout session would be created here.", plan: plan.name, checkoutUrl: null };
  }
}
