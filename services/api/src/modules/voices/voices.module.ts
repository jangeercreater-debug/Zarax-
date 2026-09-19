// Phase 1: CartesiaTTSAdapter optional — app starts without CARTESIA_API_KEY
// Phase 2: ZaraxTTSAdapter added — connects to Zarax TTS Inference Service (Kokoro-82M)
// Phase 3: VoiceDesignService + VoiceDesignController added
// Phase 4: VoiceCloneService + VoiceCloneController + ChatterboxAdapter added
// Phase 7.4: VoxCPM2Adapter added — experimental Hindi/Hinglish routing (VOXCPM2_TTS_ENABLED)
import { Module } from '@nestjs/common';
import { AuditLogModule } from '@zarax/audit-log';
import { PRISMA_CLIENT, type PrismaClient } from '@zarax/database';

import { CartesiaTTSAdapter } from './adapters/cartesia-tts.adapter';
import { ZaraxTTSAdapter } from './adapters/zarax-tts.adapter';
import { VoiceEngineService } from './voice-engine.service';
import { VoiceDesignService } from './voice-design.service';
import { VoicesController } from './voices.controller';
import { VoiceDesignController } from './voice-design.controller';
import { VoiceCloneController } from './clone/voice-clone.controller';
import { VoiceCloneService } from './clone/voice-clone.service';
import { AudioValidatorService } from './clone/audio-validator.service';
import { ChatterboxAdapter } from './clone/chatterbox.adapter';
import { VoxCPM2Adapter } from './clone/voxcpm2.adapter';

@Module({
  imports: [AuditLogModule.forRoot()],
  controllers: [
    VoiceCloneController,
    VoiceDesignController,
    VoicesController,
  ],
  providers: [
    // TTS Adapters (Phase 1-2)
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
    // Phase 3
    VoiceDesignService,
    // Phase 4 — Clone Engine (Chatterbox, protected)
    ChatterboxAdapter,
    AudioValidatorService,
    // Phase 7.4 — VoxCPM2 experimental adapter (optional — safe if unconfigured)
    VoxCPM2Adapter,
    {
      provide: VoiceCloneService,
      useFactory: (
        prisma: PrismaClient,
        audioValidator: AudioValidatorService,
        chatterbox: ChatterboxAdapter,
        voxcpm2: VoxCPM2Adapter,
      ) => new VoiceCloneService(prisma, audioValidator, chatterbox, voxcpm2),
      inject: [PRISMA_CLIENT, AudioValidatorService, ChatterboxAdapter, VoxCPM2Adapter],
    },
  ],
  exports: [VoiceEngineService, VoiceDesignService, VoiceCloneService],
})
export class VoicesModule {}
