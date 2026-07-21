import { Module } from '@nestjs/common';
import { ZARAX_LOGGER, type ZaraxLogger } from '@zarax/shared-logger';

import { LiveKitRoomService } from './livekit-room.service';
import { LiveKitTokenService } from './livekit-token.service';
import { LiveKitWebhookVerifier } from './livekit-webhook-verifier.service';

@Module({
  providers: [
    {
      provide: LiveKitRoomService,
      useFactory: (logger: ZaraxLogger): LiveKitRoomService =>
        new LiveKitRoomService(
          process.env.LIVEKIT_URL ?? '',
          process.env.LIVEKIT_API_KEY ?? '',
          process.env.LIVEKIT_API_SECRET ?? '',
          logger,
        ),
      inject: [ZARAX_LOGGER],
    },
    {
      provide: LiveKitTokenService,
      useFactory: (logger: ZaraxLogger): LiveKitTokenService =>
        new LiveKitTokenService(
          process.env.LIVEKIT_API_KEY ?? '',
          process.env.LIVEKIT_API_SECRET ?? '',
          logger,
        ),
      inject: [ZARAX_LOGGER],
    },
    {
      provide: LiveKitWebhookVerifier,
      useFactory: (): LiveKitWebhookVerifier =>
        new LiveKitWebhookVerifier(
          process.env.LIVEKIT_API_KEY ?? '',
          process.env.LIVEKIT_API_SECRET ?? '',
        ),
    },
  ],
  exports: [LiveKitRoomService, LiveKitTokenService, LiveKitWebhookVerifier],
})
export class LiveKitModule {}
