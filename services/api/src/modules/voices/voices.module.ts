// Phase 1: CartesiaTTSAdapter optional — app starts without CARTESIA_API_KEY
// Phase 2: ZaraxTTSAdapter added — connects to Zarax TTS Inference Service (Kokoro-82M)
import { Module } from '@nestjs/common';
import { AuditLogModule } from '@zarax/audit-log';

import { CartesiaTTSAdapter } from './adapters/cartesia-tts.adapter';
import { ZaraxTTSAdapter } from './adapters/zarax-tts.adapter';
import { VoiceEngineService } from './voice-engine.service';
import { VoicesController } from './voices.controller';

/**
 * Phase 2 adapter priority:
 *   1. ZaraxTTSAdapter — if ZARAX_TTS_SERVICE_URL is configured (Phase 2+)
 *   2. CartesiaTTSAdapter — if CARTESIA_API_KEY is configured (Phase 1 fallback)
 *   3. null — VOICE_PROVIDER_NOT_CONFIGURED returned on preview/synthesis
 *
 * Voice Registry CRUD works regardless of which adapter is active.
 * Phase 7 will replace Kokoro with the Zarax proprietary model in
 * zarax-tts-inference — this module needs no changes.
 */
@Module({
  imports: [AuditLogModule.forRoot()],
  controllers: [VoicesController],
  providers: [
    ZaraxTTSAdapter,
    CartesiaTTSAdapter,
    {
      provide: 'ACTIVE_TTS_ADAPTER',
      useFactory: (zarax: ZaraxTTSAdapter, cartesia: CartesiaTTSAdapter) => {
        if (zarax.isConfigured()) {
          return zarax;
        }
        if (cartesia.isConfigured()) {
          return cartesia;
        }
        return null;
      },
      inject: [ZaraxTTSAdapter, CartesiaTTSAdapter],
    },
    {
      provide: VoiceEngineService,
      useFactory: (
        prisma: import('@zarax/database').PrismaClient,
        adapter: import('./adapters/zarax-tts.adapter').ZaraxTTSAdapter | null,
      ) => new VoiceEngineService(prisma, adapter ?? undefined),
      inject: ['PRISMA_CLIENT', 'ACTIVE_TTS_ADAPTER'],
    },
  ],
  exports: [VoiceEngineService],
})
export class VoicesModule {}
