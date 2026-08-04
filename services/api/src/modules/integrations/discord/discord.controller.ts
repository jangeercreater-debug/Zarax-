import { Controller, Post, Get, Body, Headers, Inject, HttpCode, BadRequestException } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "@zarax/shared-auth";
import { PRISMA_CLIENT, type PrismaClient } from "@zarax/database";
import * as crypto from "crypto";

const DISCORD_API = "https://discord.com/api/v10";

interface DiscordInteraction {
  type: number;
  data?: { name?: string; options?: Array<{ value: string }> };
  channel_id?: string;
  token?: string;
  id?: string;
}

@ApiTags("discord")
@Controller("integrations/discord")
export class DiscordController {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: "Discord interactions webhook with signature verification." })
  @Post("webhook")
  async webhook(
    @Body() body: DiscordInteraction,
    @Headers("x-signature-ed25519") signature?: string,
    @Headers("x-signature-timestamp") timestamp?: string,
  ): Promise<Record<string, unknown>> {
    const publicKey = process.env.DISCORD_PUBLIC_KEY;

    // Verify Discord signature
    if (publicKey && signature && timestamp) {
      const isValid = this.verifySignature(publicKey, signature, timestamp, JSON.stringify(body));
      if (!isValid) throw new BadRequestException("Invalid signature");
    }

    // Type 1 = PING (Discord verification)
    if (body.type === 1) {
      return { type: 1 };
    }

    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!botToken) return { type: 4, data: { content: "Bot not configured." } };

    // Type 2 = APPLICATION_COMMAND
    if (body.type === 2 && body.data?.name === "zarax") {
      const userText = body.data.options?.[0]?.value ?? "Hello";

      try {
        const llmUrl = process.env.LLM_ORCHESTRATOR_URL ?? "http://localhost:3006";
        const llmToken = process.env.LLM_ORCHESTRATOR_SERVICE_ACCOUNT_TOKEN ?? "";

        const tenant = await this.prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
        const agent = await this.prisma.agent.findFirst({
          where: { name: { contains: "zarax", mode: "insensitive" } },
        });

        if (!tenant || !agent) return { type: 4, data: { content: "Zarax is not configured yet." } };

        const callId = "discord-" + (body.channel_id ?? "dm") + "-" + Date.now();

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
          return { type: 4, data: { content: data.response ?? "Hmm, let me think..." } };
        }
        return { type: 4, data: { content: "Sorry, I am having trouble right now." } };
      } catch {
        return { type: 4, data: { content: "Sorry, something went wrong." } };
      }
    }

    return { type: 4, data: { content: "Use /zarax <message> to talk to me!" } };
  }

  @Public()
  @Get("status")
  async status(): Promise<Record<string, unknown>> {
    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!botToken) return { connected: false, error: "DISCORD_BOT_TOKEN not configured." };

    try {
      const res = await fetch(DISCORD_API + "/users/@me", {
        headers: { "Authorization": "Bot " + botToken },
      });
      const data = await res.json() as { id?: string; username?: string };
      if (data.id) return { connected: true, botUsername: data.username, botId: data.id };
      return { connected: false, error: "Invalid bot token" };
    } catch {
      return { connected: false, error: "Cannot reach Discord API" };
    }
  }

  private verifySignature(publicKey: string, signature: string, timestamp: string, body: string): boolean {
    try {
      const msg = Buffer.from(timestamp + body);
      const sig = Buffer.from(signature, "hex");
      const key = Buffer.from(publicKey, "hex");
      return crypto.verify(null, msg, { key: crypto.createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), key]), format: "der", type: "spki" }), dsaEncoding: "ieee-p1363" }, sig);
    } catch {
      return false;
    }
  }
}
