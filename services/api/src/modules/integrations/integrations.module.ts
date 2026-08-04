import { Module } from "@nestjs/common";
import { IntegrationsController } from "./integrations.controller";
import { TelegramModule } from "./telegram/telegram.module";
import { SlackModule } from "./slack/slack.module";
import { StripeModule } from "./stripe/stripe.module";
import { WhatsAppModule } from "./whatsapp/whatsapp.module";
import { DiscordModule } from "./discord/discord.module";

@Module({
  imports: [TelegramModule, SlackModule, StripeModule, WhatsAppModule, DiscordModule],
  controllers: [IntegrationsController],
})
export class IntegrationsModule {}
