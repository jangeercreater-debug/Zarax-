import { Module } from "@nestjs/common";
import { IntegrationsController } from "./integrations.controller";
import { TelegramModule } from "./telegram/telegram.module";

@Module({
  imports: [TelegramModule],
  controllers: [IntegrationsController],
})
export class IntegrationsModule {}
