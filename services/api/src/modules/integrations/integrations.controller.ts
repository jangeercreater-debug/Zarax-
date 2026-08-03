import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentPrincipal, RequirePermission } from "@zarax/shared-auth";
import { PERMISSIONS, type Principal } from "@zarax/shared-types";

interface IntegrationStatus {
  id: string;
  name: string;
  description: string;
  category: string;
  status: "connected" | "not_configured" | "error";
  configuredKeys: string[];
  missingKeys: string[];
  docsUrl: string;
}

const INTEGRATIONS: Array<{
  id: string;
  name: string;
  description: string;
  category: string;
  requiredEnvKeys: string[];
  docsUrl: string;
}> = [
  {
    id: "stripe",
    name: "Stripe",
    description: "Payment processing, subscriptions, invoices, and billing.",
    category: "payments",
    requiredEnvKeys: ["STRIPE_SECRET_KEY"],
    docsUrl: "https://stripe.com/docs/api",
  },
  {
    id: "twilio",
    name: "Twilio",
    description: "Phone calls, SMS messaging, and telephony.",
    category: "telephony",
    requiredEnvKeys: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER"],
    docsUrl: "https://www.twilio.com/docs",
  },
  {
    id: "telegram",
    name: "Telegram",
    description: "Telegram bot for chat-based AI conversations.",
    category: "messaging",
    requiredEnvKeys: ["TELEGRAM_BOT_TOKEN"],
    docsUrl: "https://core.telegram.org/bots/api",
  },
  {
    id: "slack",
    name: "Slack",
    description: "Slack bot integration for workspace notifications and AI chat.",
    category: "messaging",
    requiredEnvKeys: ["SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET"],
    docsUrl: "https://api.slack.com/docs",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    description: "WhatsApp Business API for customer conversations.",
    category: "messaging",
    requiredEnvKeys: ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN"],
    docsUrl: "https://developers.facebook.com/docs/whatsapp",
  },
  {
    id: "gmail",
    name: "Gmail",
    description: "Send and receive emails via Gmail API.",
    category: "email",
    requiredEnvKeys: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"],
    docsUrl: "https://developers.google.com/gmail/api",
  },
  {
    id: "google_calendar",
    name: "Google Calendar",
    description: "Schedule meetings and manage calendar events.",
    category: "calendar",
    requiredEnvKeys: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"],
    docsUrl: "https://developers.google.com/calendar/api",
  },
  {
    id: "discord",
    name: "Discord",
    description: "Discord bot for community AI conversations.",
    category: "messaging",
    requiredEnvKeys: ["DISCORD_BOT_TOKEN"],
    docsUrl: "https://discord.com/developers/docs",
  },
];

@ApiTags("integrations")
@Controller("integrations")
export class IntegrationsController {
  @RequirePermission(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: "List all available integrations with connection status." })
  @Get()
  async list(@CurrentPrincipal() _principal: Principal): Promise<Record<string, unknown>> {
    const statuses: IntegrationStatus[] = INTEGRATIONS.map((integration) => {
      const configured = integration.requiredEnvKeys.filter((key) => Boolean(process.env[key]));
      const missing = integration.requiredEnvKeys.filter((key) => !process.env[key]);
      const allConfigured = missing.length === 0;

      return {
        id: integration.id,
        name: integration.name,
        description: integration.description,
        category: integration.category,
        status: allConfigured ? "connected" : "not_configured",
        configuredKeys: configured,
        missingKeys: missing,
        docsUrl: integration.docsUrl,
      };
    });

    const connected = statuses.filter((s) => s.status === "connected").length;

    return {
      integrations: statuses,
      summary: {
        total: statuses.length,
        connected,
        notConfigured: statuses.length - connected,
      },
    };
  }

  @RequirePermission(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: "Get integration details by ID." })
  @Get(":id")
  async getById(@CurrentPrincipal() _principal: Principal): Promise<Record<string, unknown>> {
    return { message: "Use GET /integrations for full list with status." };
  }
}
