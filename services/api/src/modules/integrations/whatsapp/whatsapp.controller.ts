import { Controller, Post, Get, Body, Query, Inject } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "@zarax/shared-auth";
import { PRISMA_CLIENT, type PrismaClient } from "@zarax/database";

const WA_API = "https://graph.facebook.com/v18.0";

interface WhatsAppMessage {
  object: string;
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{ from: string; text?: { body: string }; type: string }>;
        metadata?: { phone_number_id: string };
      };
    }>;
  }>;
}

@ApiTags("whatsapp")
@Controller("integrations/whatsapp")
export class WhatsAppController {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  @Public()
  @ApiOperation({ summary: "WhatsApp webhook verification." })
  @Get("webhook")
  async verify(
    @Query("hub.mode") mode?: string,
    @Query("hub.verify_token") verifyToken?: string,
    @Query("hub.challenge") challenge?: string,
  ): Promise<string> {
    const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN ?? "zarax-verify";
    if (mode === "subscribe" && verifyToken === expectedToken) {
      return challenge ?? "";
    }
    return "Forbidden";
  }

  @Public()
  @ApiOperation({ summary: "WhatsApp incoming message webhook." })
  @Post("webhook")
  async webhook(@Body() body: WhatsAppMessage): Promise<{ status: string }> {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!accessToken || !phoneNumberId) return { status: "not_configured" };

    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];

    if (!message || message.type !== "text" || !message.text?.body) return { status: "ignored" };

    const from = message.from;
    const userText = message.text.body;

    try {
      const llmUrl = process.env.LLM_ORCHESTRATOR_URL ?? "http://localhost:3006";
      const llmToken = process.env.LLM_ORCHESTRATOR_SERVICE_ACCOUNT_TOKEN ?? "";

      const tenant = await this.prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
      const agent = await this.prisma.agent.findFirst({
        where: { name: { contains: "zarax", mode: "insensitive" } },
      });

      if (!tenant || !agent) {
        await this.sendWhatsAppMessage(accessToken, phoneNumberId, from, "Sorry, I am not configured yet.");
        return { status: "no_agent" };
      }

      const callId = "wa-" + from + "-" + Date.now();

      const res = await fetch(llmUrl + "/conversations/" + callId + "/turns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Service-Account-Token": llmToken,
        },
        body: JSON.stringify({ agentId: agent.id, tenantId: tenant.id, text: userText }),
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        const data = await res.json() as { response?: string };
        await this.sendWhatsAppMessage(accessToken, phoneNumberId, from, data.response ?? "Let me think...");
      } else {
        await this.sendWhatsAppMessage(accessToken, phoneNumberId, from, "Sorry, I am having trouble right now.");
      }
    } catch {
      await this.sendWhatsAppMessage(accessToken, phoneNumberId, from, "Sorry, something went wrong.");
    }

    return { status: "processed" };
  }

  @Public()
  @Get("status")
  async status(): Promise<Record<string, unknown>> {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!accessToken) return { connected: false, error: "WHATSAPP_ACCESS_TOKEN not configured." };
    return { connected: true, phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "not set" };
  }

  private async sendWhatsAppMessage(accessToken: string, phoneNumberId: string, to: string, text: string): Promise<void> {
    await fetch(WA_API + "/" + phoneNumberId + "/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + accessToken },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
    }).catch(() => undefined);
  }
}
