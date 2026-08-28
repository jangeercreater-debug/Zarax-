import { Module } from '@nestjs/common';
import { AuditLogModule } from '@zarax/audit-log';

import { CartesiaTTSAdapter } from './adapters/cartesia-tts.adapter';
import { VoiceEngineService } from './voice-engine.service';
import { VoicesController } from './voices.controller';

/**
 * Phase 1: Voice Engine Module
 *
 * Registers the Voice Engine, CartesiaTTSAdapter, and Voice Registry API.
 *
 * Future phases add new adapters here without touching other modules:
 *   Phase 2: OpenSourceTTSAdapter
 *   Phase 4: VoiceCloneAdapter
 *   Phase 7: ZaraxTTSAdapter
 */
@Module({
  imports: [AuditLogModule.forRoot()],
  controllers: [VoicesController],
  providers: [CartesiaTTSAdapter, VoiceEngineService],
  exports: [VoiceEngineService],
})
export class VoicesModule {}
