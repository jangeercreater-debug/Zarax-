import { Controller, Get, Post, Delete, Body, Param, Inject } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentPrincipal, RequirePermission } from "@zarax/shared-auth";
import { PRISMA_CLIENT, type PrismaClient } from "@zarax/database";
import { PERMISSIONS, type Principal } from "@zarax/shared-types";
import * as crypto from "crypto";

const WEBHOOK_EVENTS = [
  "call.started",
  "call.ended",
  "call.failed",
  "agent.created",
  "agent.updated",
  "agent.published",
  "memory.stored",
  "team.member_added",
  "team.member_removed",
] as const;

@ApiTags("webhooks")
@Controller("webhooks")
export class WebhooksController {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  @RequirePermission(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: "Register a webhook endpoint." })
  @Post()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: { url: string; events: string[]; description?: string },
  ): Promise<Record<string, unknown>> {
    const secret = "whsec_" + crypto.randomBytes(24).toString("hex");

    const webhook = await this.prisma.webhook.create({
      data: {
        tenantId: principal.tenantId,
        url: body.url,
        events: body.events,
        secret,
        description: body.description ?? "",
        isActive: true,
      },
    });

    return {
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      secret,
      isActive: webhook.isActive,
      createdAt: webhook.createdAt,
      message: "Save the secret. It will not be shown again.",
    };
  }

  @RequirePermission(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: "List all webhook endpoints." })
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Record<string, unknown>> {
    const webhooks = await this.prisma.webhook.findMany({
      where: { tenantId: principal.tenantId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        url: true,
        events: true,
        description: true,
        isActive: true,
        lastTriggeredAt: true,
        createdAt: true,
      },
    });

    return { webhooks, total: webhooks.length };
  }

  @RequirePermission(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: "List available webhook events." })
  @Get("events")
  async events(): Promise<Record<string, unknown>> {
    return { events: WEBHOOK_EVENTS };
  }

  @RequirePermission(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: "Delete a webhook endpoint." })
  @Delete(":id")
  async remove(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Record<string, unknown>> {
    await this.prisma.webhook.deleteMany({
      where: { id, tenantId: principal.tenantId },
    });
    return { deleted: true };
  }

  @RequirePermission(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: "Test a webhook by sending a test event." })
  @Post(":id/test")
  async test(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Record<string, unknown>> {
    const webhook = await this.prisma.webhook.findFirst({
      where: { id, tenantId: principal.tenantId },
    });
    if (!webhook) return { error: "Webhook not found" };

    try {
      const payload = JSON.stringify({
        event: "webhook.test",
        timestamp: new Date().toISOString(),
        data: { message: "This is a test webhook from Zarax." },
      });

      const signature = crypto.createHmac("sha256", webhook.secret).update(payload).digest("hex");

      const res = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Zarax-Signature": signature,
          "X-Zarax-Event": "webhook.test",
        },
        body: payload,
        signal: AbortSignal.timeout(10000),
      });

      return { success: res.ok, status: res.status };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed" };
    }
  }
}
