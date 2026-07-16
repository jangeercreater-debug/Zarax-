import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfigService } from '@zarax/shared-config';

import type { VoiceGatewayEnv } from '../config/env.schema';
import { LiveKitRoomService } from './livekit-room.service';
import { LiveKitTokenService } from './livekit-token.service';
import { LiveKitWebhookVerifier } from './livekit-webhook-verifier.service';

@Module({
  providers: [
    {
      provide: LiveKitRoomService,
      useFactory: (config: AppConfigService<VoiceGatewayEnv>): LiveKitRoomService =>
        new LiveKitRoomService(
          config.get('LIVEKIT_URL'),
          config.get('LIVEKIT_API_KEY'),
          config.get('LIVEKIT_API_SECRET'),
        ),
      inject: [APP_CONFIG],
    },
    {
      provide: LiveKitTokenService,
      useFactory: (config: AppConfigService<VoiceGatewayEnv>): LiveKitTokenService =>
        new LiveKitTokenService(config.get('LIVEKIT_API_KEY'), config.get('LIVEKIT_API_SECRET')),
      inject: [APP_CONFIG],
    },
    {
      provide: LiveKitWebhookVerifier,
      useFactory: (config: AppConfigService<VoiceGatewayEnv>): LiveKitWebhookVerifier =>
        new LiveKitWebhookVerifier(config.get('LIVEKIT_API_KEY'), config.get('LIVEKIT_API_SECRET')),
      inject: [APP_CONFIG],
    },
  ],
  exports: [LiveKitRoomService, LiveKitTokenService, LiveKitWebhookVerifier],
})
export class LiveKitModule {}
