import { Controller, Post, Get, Body, Inject } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentPrincipal, RequirePermission } from "@zarax/shared-auth";
import { PRISMA_CLIENT, type PrismaClient } from "@zarax/database";
import { PERMISSIONS, type Principal } from "@zarax/shared-types";

@ApiTags("stripe")
@Controller("integrations/stripe")
export class StripeController {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  @RequirePermission(PERMISSIONS.TENANT_MANAGE_BILLING)
  @ApiOperation({ summary: "Create Stripe checkout session for plan upgrade." })
  @Post("checkout")
  async createCheckout(
    @CurrentPrincipal() principal: Principal,
    @Body() body: { planId: string; successUrl?: string; cancelUrl?: string },
  ): Promise<Record<string, unknown>> {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return { error: "Stripe not configured. Add STRIPE_SECRET_KEY to Railway.", checkoutUrl: null };

    try {
      const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          "Authorization": "Basic " + Buffer.from(stripeKey + ":").toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          mode: "subscription",
          "line_items[0][price]": body.planId,
          "line_items[0][quantity]": "1",
          success_url: body.successUrl ?? "https://zaraxweb-production.up.railway.app/billing?success=true",
          cancel_url: body.cancelUrl ?? "https://zaraxweb-production.up.railway.app/billing?cancelled=true",
          "metadata[tenantId]": principal.tenantId,
        }).toString(),
      });

      const session = await res.json() as { id?: string; url?: string; error?: { message: string } };
      if (session.error) return { error: session.error.message };
      return { checkoutUrl: session.url, sessionId: session.id };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Checkout failed" };
    }
  }

  @ApiOperation({ summary: "Stripe webhook for payment events." })
  @Post("webhook")
  async webhook(@Body() body: Record<string, unknown>): Promise<{ received: boolean }> {
    const type = body.type as string;

    if (type === "checkout.session.completed") {
      const session = body.data as Record<string, unknown>;
      const obj = session?.object as Record<string, unknown>;
      const metadata = obj?.metadata as Record<string, string>;
      const tenantId = metadata?.tenantId;

      if (tenantId) {
        await this.prisma.tenant.update({
          where: { id: tenantId },
          data: { plan: "GROWTH" as never },
        }).catch(() => undefined);
      }
    }

    return { received: true };
  }

  @RequirePermission(PERMISSIONS.TENANT_MANAGE_BILLING)
  @ApiOperation({ summary: "Check Stripe connection status." })
  @Get("status")
  async status(): Promise<Record<string, unknown>> {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return { connected: false, error: "STRIPE_SECRET_KEY not configured." };

    try {
      const res = await fetch("https://api.stripe.com/v1/balance", {
        headers: { "Authorization": "Basic " + Buffer.from(stripeKey + ":").toString("base64") },
      });
      const data = await res.json() as { object?: string; error?: { message: string } };
      if (data.object === "balance") return { connected: true };
      return { connected: false, error: data.error?.message ?? "Invalid key" };
    } catch {
      return { connected: false, error: "Cannot reach Stripe API" };
    }
  }
}
