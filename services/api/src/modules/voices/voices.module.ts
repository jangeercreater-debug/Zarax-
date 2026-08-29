// Phase 1: CartesiaTTSAdapter optional — app starts without CARTESIA_API_KEY
// Phase 2: ZaraxTTSAdapter added — connects to Zarax TTS Inference Service (Kokoro-82M)
// Phase 3: VoiceDesignService + VoiceDesignController added
import { Module } from '@nestjs/common';
import { AuditLogModule } from '@zarax/audit-log';
import { PRISMA_CLIENT, type PrismaClient } from '@zarax/database';

import { CartesiaTTSAdapter } from './adapters/cartesia-tts.adapter';
import { ZaraxTTSAdapter } from './adapters/zarax-tts.adapter';
import { VoiceEngineService } from './voice-engine.service';
import { VoiceDesignService } from './voice-design.service';
import { VoicesController } from './voices.controller';
import { VoiceDesignController } from './voice-design.controller';

/**
 * Adapter priority:
 *   1. ZaraxTTSAdapter — if ZARAX_TTS_SERVICE_URL configured (Phase 2+)
 *   2. CartesiaTTSAdapter — if CARTESIA_API_KEY configured (Phase 1 fallback)
 *   3. undefined — VOICE_PROVIDER_NOT_CONFIGURED on preview/synthesis
 */
@Module({
  imports: [AuditLogModule.forRoot()],
  controllers: [VoiceDesignController, VoicesController],
  providers: [
    ZaraxTTSAdapter,
    CartesiaTTSAdapter,
    {
      provide: 'ACTIVE_TTS_ADAPTER',
      useFactory: (zarax: ZaraxTTSAdapter, cartesia: CartesiaTTSAdapter): CartesiaTTSAdapter | undefined => {
        if (zarax.isConfigured()) return zarax as unknown as CartesiaTTSAdapter;
        if (cartesia.isConfigured()) return cartesia;
        return undefined;
      },
      inject: [ZaraxTTSAdapter, CartesiaTTSAdapter],
    },
    {
      provide: VoiceEngineService,
      useFactory: (prisma: PrismaClient, adapter: CartesiaTTSAdapter | undefined) =>
        new VoiceEngineService(prisma, adapter),
      inject: [PRISMA_CLIENT, 'ACTIVE_TTS_ADAPTER'],
    },
    VoiceDesignService,
  ],
  exports: [VoiceEngineService, VoiceDesignService],
})
export class VoicesModule {}
