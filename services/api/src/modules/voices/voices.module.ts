// Phase 1: CartesiaTTSAdapter optional — app starts without CARTESIA_API_KEY
import { Module } from '@nestjs/common';
import { AuditLogModule } from '@zarax/audit-log';

import { CartesiaTTSAdapter } from './adapters/cartesia-tts.adapter';
import { VoiceEngineService } from './voice-engine.service';
import { VoicesController } from './voices.controller';

/**
 * Phase 1: Voice Engine Module
 *
 * IMPORTANT: CartesiaTTSAdapter is registered as OPTIONAL.
 * The Voice Registry (CRUD, list, validate) works with zero env vars.
 * Preview and synthesis return VOICE_PROVIDER_NOT_CONFIGURED when
 * CARTESIA_API_KEY is absent — this is correct Phase 1 behavior.
 *
 * Phase 2 will wire in the open-source TTS adapter here instead.
 * No changes to VoiceEngineService or VoicesController will be needed.
 */
@Module({
  imports: [AuditLogModule.forRoot()],
  controllers: [VoicesController],
  providers: [
    {
      provide: CartesiaTTSAdapter,
      useFactory: () => {
        const adapter = new CartesiaTTSAdapter();
        if (!adapter.isConfigured()) {
          return undefined;
        }
        return adapter;
      },
    },
    VoiceEngineService,
  ],
  exports: [VoiceEngineService],
})
export class VoicesModule {}
