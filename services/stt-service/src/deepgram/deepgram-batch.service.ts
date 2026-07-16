import { Inject, Injectable } from '@nestjs/common';
import { createClient, type DeepgramClient } from '@deepgram/sdk';
import { ResilientClient } from '@zarax/resilience';
import { APP_CONFIG, type AppConfigService } from '@zarax/shared-config';
import { ExternalServiceError } from '@zarax/shared-errors';
import { ZARAX_LOGGER, type ZaraxLogger } from '@zarax/shared-logger';

import type { SttServiceEnv } from '../config/env.schema';
import { mapPrerecordedResult, type BatchTranscriptResult } from './prerecorded-mapper';

export interface TranscribeFileOptions {
  model?: string;
  language?: string;
  mimetype: string;
}

@Injectable()
export class DeepgramBatchService {
  private readonly client: DeepgramClient;
  public readonly resilientClient: ResilientClient;

  constructor(
    @Inject(APP_CONFIG) config: AppConfigService<SttServiceEnv>,
    @Inject(ZARAX_LOGGER) logger: ZaraxLogger,
  ) {
    this.client = createClient(config.get('DEEPGRAM_API_KEY'));
    this.resilientClient = new ResilientClient({
      providerName: 'deepgram',
      timeoutMs: 20_000, // prerecorded transcription can legitimately take a few seconds
      retry: { maxAttempts: 3, baseDelayMs: 300, maxDelayMs: 3000 },
      circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30_000 },
      rateLimiter: { capacity: 20, refillPerSecond: 5 },
      logger,
    });
  }

  async transcribeFile(audio: Buffer, options: TranscribeFileOptions): Promise<BatchTranscriptResult> {
    return this.resilientClient.execute(async () => {
      const { result, error } = await this.client.listen.prerecorded.transcribeFile(audio, {
        model: options.model ?? 'nova-2',
        language: options.language ?? 'en-US',
        smart_format: true,
        mimetype: options.mimetype,
      });

      if (error) {
        throw new ExternalServiceError('Deepgram', error.message ?? 'Prerecorded transcription failed');
      }

      return mapPrerecordedResult(result ?? {}) ?? { text: '', confidence: 0 };
    }, 'Deepgram.transcribeFile');
  }
}
