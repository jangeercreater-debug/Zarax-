import { Module } from '@nestjs/common';

import { CallsModule } from '../calls/calls.module';
import { LiveKitModule } from '../livekit/livekit.module';
import { LiveKitWebhookController } from './livekit-webhook.controller';

@Module({
  imports: [LiveKitModule, CallsModule],
  controllers: [LiveKitWebhookController],
})
export class WebhooksModule {}
