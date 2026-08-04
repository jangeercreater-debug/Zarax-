import { Controller, Post, Get, Body, Inject } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { PRISMA_CLIENT, type PrismaClient } from "@zarax/database";

interface SlackEvent {
  type: string;
  challenge?: string;
  event?: {
    type: string;
    text?: string;
    user?: string;
    channel?: string;
    ts?: string;
    bot_id?: string;
  };
}

@ApiTags("slack")
@Controller("integrations/slack")
export class SlackController {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  @ApiOperation({ summary: "Slack Events API webhook." })
  @Post("webhook")
  async webhook(@Body() body: SlackEvent): Promise<Record<string, unknown>> {
    // URL verification challenge
    if (body.type === "url_verification" && body.challenge) {
      return { challenge: body.challenge };
    }

    const botToken = process.env.SLACK_BOT_TOKEN;
    if (!botToken) return { ok: false };

    const event = body.event;
    if (!event || event.type !== "message" || event.bot_id || !event.text || !event.channel) {
      return { ok: true };
    }

    const userText = event.text;
    const channel = event.channel;

    try {
      const llmUrl = process.env.LLM_ORCHESTRATOR_URL ?? "http://localhost:3006";
      const llmToken = process.env.LLM_ORCHESTRATOR_SERVICE_ACCOUNT_TOKEN ?? "";

      const tenant = await this.prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
      const agent = await this.prisma.agent.findFirst({
        where: { name: { contains: "zarax", mode: "insensitive" } },
      });

      if (!tenant || !agent) {
        await this.sendSlackMessage(botToken, channel, "Sorry, I am not configured yet.");
        return { ok: true };
      }

      const callId = "slack-" + channel + "-" + Date.now();

      const res = await fetch(llmUrl + "/v1/conversation/turn", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Service-Account-Token": llmToken,
          "X-Tenant-Id": tenant.id,
        },
        body: JSON.stringify({ callId, agentId: agent.id, tenantId: tenant.id, text: userText }),
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        const data = await res.json() as { response?: string };
        await this.sendSlackMessage(botToken, channel, data.response ?? "Hmm, let me think...");
      } else {
        await this.sendSlackMessage(botToken, channel, "Sorry, I am having trouble right now.");
      }
    } catch {
      await this.sendSlackMessage(botToken, channel, "Sorry, something went wrong.");
    }

    return { ok: true };
  }

  @ApiOperation({ summary: "Check Slack bot status." })
  @Get("status")
  async status(): Promise<Record<string, unknown>> {
    const botToken = process.env.SLACK_BOT_TOKEN;
    if (!botToken) return { connected: false, error: "SLACK_BOT_TOKEN not configured." };

    try {
      const res = await fetch("https://slack.com/api/auth.test", {
        headers: { "Authorization": "Bearer " + botToken },
      });
      const data = await res.json() as { ok: boolean; user?: string; team?: string };
      return { connected: data.ok, botUser: data.user, team: data.team };
    } catch {
      return { connected: false, error: "Cannot reach Slack API" };
    }
  }

  private async sendSlackMessage(botToken: string, channel: string, text: string): Promise<void> {
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + botToken },
      body: JSON.stringify({ channel, text }),
    }).catch(() => undefined);
  }
}
