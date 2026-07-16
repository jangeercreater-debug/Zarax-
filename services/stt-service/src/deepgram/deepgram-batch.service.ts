import { Inject, Injectable } from '@nestjs/common';
import { createClient, type DeepgramClient } from '@deepgram/sdk';
import { APP_CONFIG, type AppConfigService } from '@zarax/shared-config';
import { ExternalServiceError } from '@zarax/shared-errors';

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

  constructor(@Inject(APP_CONFIG) config: AppConfigService<SttServiceEnv>) {
    this.client = createClient(config.get('DEEPGRAM_API_KEY'));
  }

  async transcribeFile(audio: Buffer, options: TranscribeFileOptions): Promise<BatchTranscriptResult> {
    const { result, error } = await this.client.listen.prerecorded.transcribeFile(audio, {
      model: options.model ?? 'nova-2',
      language: options.language ?? 'en-US',
      smart_format: true,
      mimetype: options.mimetype,
    });

    if (error) {
      throw new ExternalServiceError('Deepgram', error.message ?? 'Prerecorded transcription failed');
    }

    const mapped = mapPrerecordedResult(result ?? {});
    if (!mapped) {
      return { text: '', confidence: 0 };
    }
    return mapped;
  }
}
