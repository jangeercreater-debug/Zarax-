import { Controller, Post, Get, Body, Inject } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "@zarax/shared-auth";
import { PRISMA_CLIENT, type PrismaClient } from "@zarax/database";

const TELEGRAM_API = "https://api.telegram.org/bot";

interface TelegramMessage {
  message_id: number;
  chat: { id: number; first_name?: string; username?: string };
  text?: string;
  from?: { id: number; first_name?: string; language_code?: string };
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

@ApiTags("telegram")
@Controller("integrations/telegram")
export class TelegramController {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  @Public()
  @ApiOperation({ summary: "Telegram webhook - receives messages from Telegram." })
  @Post("webhook")
  async webhook(@Body() update: TelegramUpdate): Promise<{ ok: boolean }> {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return { ok: false };

    const message = update.message;
    if (!message?.text) return { ok: true };

    const chatId = message.chat.id;
    const userText = message.text;
    const userName = message.from?.first_name ?? "User";

    if (userText === "/start") {
      await this.sendTelegramMessage(botToken, chatId, "Hi " + userName + "! Main Zarax hoon. Mujhse kisi bhi language mein baat karo.");
      return { ok: true };
    }

    try {
      const llmUrl = process.env.LLM_ORCHESTRATOR_URL ?? "http://localhost:3006";
      const llmToken = process.env.LLM_ORCHESTRATOR_SERVICE_ACCOUNT_TOKEN ?? "";

      const tenant = await this.prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
      const agent = await this.prisma.agent.findFirst({
        where: { name: { contains: "zarax", mode: "insensitive" } },
      });

      if (!tenant || !agent) {
        await this.sendTelegramMessage(botToken, chatId, "Sorry, I am not configured yet.");
        return { ok: true };
      }

      const callId = "tg-" + chatId + "-" + Date.now();

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
        await this.sendTelegramMessage(botToken, chatId, data.response ?? "Hmm, let me think...");
      } else {
        await this.sendTelegramMessage(botToken, chatId, "Sorry, I am having trouble right now. Try again.");
      }
    } catch {
      await this.sendTelegramMessage(botToken, chatId, "Sorry, something went wrong. Try again in a moment.");
    }

    return { ok: true };
  }

  @Public()
  @ApiOperation({ summary: "Setup Telegram webhook URL." })
  @Get("setup")
  async setup(): Promise<Record<string, unknown>> {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return { error: "TELEGRAM_BOT_TOKEN not configured." };

    const webhookUrl = process.env.API_PUBLIC_URL ?? "https://zaraxapi-production.up.railway.app";
    const url = webhookUrl + "/v1/integrations/telegram/webhook";

    try {
      const res = await fetch(TELEGRAM_API + botToken + "/setWebhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json() as Record<string, unknown>;
      return { webhookUrl: url, telegramResponse: data };
    } catch (error) {
      return { error: "Failed to set webhook", message: error instanceof Error ? error.message : String(error) };
    }
  }

  @Public()
  @ApiOperation({ summary: "Check Telegram bot status." })
  @Get("status")
  async status(): Promise<Record<string, unknown>> {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return { connected: false, error: "TELEGRAM_BOT_TOKEN not configured." };

    try {
      const res = await fetch(TELEGRAM_API + botToken + "/getMe");
      const data = await res.json() as { ok: boolean; result?: { username: string; first_name: string } };
      if (data.ok) return { connected: true, botUsername: data.result?.username, botName: data.result?.first_name };
      return { connected: false, error: "Invalid bot token" };
    } catch {
      return { connected: false, error: "Cannot reach Telegram API" };
    }
  }

  private async sendTelegramMessage(botToken: string, chatId: number, text: string): Promise<void> {
    await fetch(TELEGRAM_API + botToken + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    }).catch(() => undefined);
  }
}
