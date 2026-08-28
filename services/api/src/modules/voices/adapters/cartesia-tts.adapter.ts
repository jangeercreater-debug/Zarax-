import { Injectable, Logger } from '@nestjs/common';
import { NotFoundError } from '@zarax/shared-errors';

import { DEFAULT_AUDIO_CONTRACT, VOICE_ERROR_CODES, type SynthesizeRequest } from '../dto/voice.types';
import type { TTSAdapter } from './tts-adapter.interface';

const CARTESIA_BYTES_ENDPOINT = 'https://api.cartesia.ai/tts/bytes';
const DEFAULT_MODEL_ID = 'sonic-2';
const PREVIEW_MODEL_ID = 'sonic-2';
const PREVIEW_MAX_CHARS = 200;
const SAMPLE_PREVIEW_TEXT = 'Hi! I am Zarax. How can I help you today?';

/**
 * Phase 1: Cartesia TTS Adapter
 *
 * Wraps Cartesia's REST /tts/bytes endpoint behind the TTSAdapter interface.
 * The Voice Engine never imports Cartesia directly — only this adapter does.
 *
 * NOTE: This adapter calls Cartesia's REST endpoint directly.
 * The existing tts-service uses the same Cartesia API for the live voice
 * pipeline (via WebSocket streaming) — this adapter is separate and used
 * only for Voice Registry preview and on-demand synthesis from the API.
 * Do NOT replace or modify the existing CartesiaStreamSession in tts-service.
 *
 * Phase 2 will add: OpenSourceTTSAdapter
 * Phase 7 will add: ZaraxTTSAdapter
 */
@Injectable()
export class CartesiaTTSAdapter implements TTSAdapter {
  readonly providerId = 'cartesia';
  private readonly logger = new Logger(CartesiaTTSAdapter.name);
  private readonly apiKey = process.env.CARTESIA_API_KEY ?? '';
  private readonly apiVersion = process.env.CARTESIA_API_VERSION ?? '2024-06-10';

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async synthesize(request: SynthesizeRequest, providerVoiceId: string): Promise<Buffer> {
    if (!this.isConfigured()) {
      const err = new NotFoundError('TTS provider');
      (err as Record<string, unknown>)['voiceErrorCode'] = VOICE_ERROR_CODES.VOICE_PROVIDER_NOT_CONFIGURED;
      throw err;
    }

    const format = { ...DEFAULT_AUDIO_CONTRACT, ...request.outputFormat };
    const text = request.text.slice(0, 5000);

    this.logger.log('CartesiaTTSAdapter: synthesize', {
      requestId: request.requestId,
      voiceId: request.voiceId,
      providerVoiceId,
      chars: text.length,
    });

    return this.callCartesia(providerVoiceId, text, format.sampleRate);
  }

  async preview(providerVoiceId: string, sampleText?: string): Promise<Buffer> {
    if (!this.isConfigured()) {
      const err = new NotFoundError('TTS provider');
      (err as Record<string, unknown>)['voiceErrorCode'] = VOICE_ERROR_CODES.VOICE_PROVIDER_NOT_CONFIGURED;
      throw err;
    }

    const text = (sampleText ?? SAMPLE_PREVIEW_TEXT).slice(0, PREVIEW_MAX_CHARS);
    this.logger.log('CartesiaTTSAdapter: preview', { providerVoiceId, chars: text.length });
    return this.callCartesia(providerVoiceId, text, DEFAULT_AUDIO_CONTRACT.sampleRate, PREVIEW_MODEL_ID);
  }

  async healthCheck(): Promise<{ healthy: boolean; reason?: string }> {
    if (!this.isConfigured()) {
      return { healthy: false, reason: 'CARTESIA_API_KEY not configured' };
    }

    try {
      const res = await fetch('https://api.cartesia.ai/voices', {
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey,
          'Cartesia-Version': this.apiVersion,
        },
        signal: AbortSignal.timeout(5000),
      });
      return res.ok
        ? { healthy: true }
        : { healthy: false, reason: `Cartesia API returned ${res.status}` };
    } catch (error) {
      return {
        healthy: false,
        reason: error instanceof Error ? error.message : 'Cartesia unreachable',
      };
    }
  }

  private async callCartesia(
    providerVoiceId: string,
    text: string,
    sampleRate: number,
    modelId = DEFAULT_MODEL_ID,
  ): Promise<Buffer> {
    let response: Response;
    try {
      response = await fetch(CARTESIA_BYTES_ENDPOINT, {
        method: 'POST',
        headers: {
          'X-API-Key': this.apiKey,
          'Cartesia-Version': this.apiVersion,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_id: modelId,
          transcript: text,
          voice: { mode: 'id', id: providerVoiceId },
          output_format: {
            container: 'wav',
            encoding: 'pcm_s16le',
            sample_rate: sampleRate,
          },
        }),
        signal: AbortSignal.timeout(15000),
      });
    } catch (error) {
      this.logger.error('CartesiaTTSAdapter: network error', {
        message: error instanceof Error ? error.message : String(error),
      });
      const err = new Error('Cartesia synthesis failed: network error');
      (err as Record<string, unknown>)['voiceErrorCode'] = VOICE_ERROR_CODES.VOICE_SYNTHESIS_FAILED;
      throw err;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error('CartesiaTTSAdapter: HTTP error', { status: response.status, body });
      const err = new Error(`Cartesia synthesis failed: HTTP ${response.status}`);
      (err as Record<string, unknown>)['voiceErrorCode'] = VOICE_ERROR_CODES.VOICE_SYNTHESIS_FAILED;
      throw err;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
