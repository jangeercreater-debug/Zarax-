import { Module } from "@nestjs/common";
import { IntegrationsController } from "./integrations.controller";
import { TelegramModule } from "./telegram/telegram.module";
import { SlackModule } from "./slack/slack.module";
import { StripeModule } from "./stripe/stripe.module";

@Module({
  imports: [TelegramModule, SlackModule, StripeModule],
  controllers: [IntegrationsController],
})
export class IntegrationsModule {}
