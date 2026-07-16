import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfigService } from '@zarax/shared-config';
import { ZARAX_LOGGER, type ZaraxLogger } from '@zarax/shared-logger';

import type { VoiceGatewayEnv } from '../config/env.schema';
import { LiveKitRoomService } from './livekit-room.service';
import { LiveKitTokenService } from './livekit-token.service';
import { LiveKitWebhookVerifier } from './livekit-webhook-verifier.service';

@Module({
  providers: [
    {
      provide: LiveKitRoomService,
      useFactory: (config: AppConfigService<VoiceGatewayEnv>, logger: ZaraxLogger): LiveKitRoomService =>
        new LiveKitRoomService(
          config.get('LIVEKIT_URL'),
          config.get('LIVEKIT_API_KEY'),
          config.get('LIVEKIT_API_SECRET'),
          logger,
        ),
      inject: [APP_CONFIG, ZARAX_LOGGER],
    },
    {
      provide: LiveKitTokenService,
      useFactory: (config: AppConfigService<VoiceGatewayEnv>, logger: ZaraxLogger): LiveKitTokenService =>
        new LiveKitTokenService(config.get('LIVEKIT_API_KEY'), config.get('LIVEKIT_API_SECRET'), logger),
      inject: [APP_CONFIG, ZARAX_LOGGER],
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
