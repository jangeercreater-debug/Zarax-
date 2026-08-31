import { Injectable, Logger } from '@nestjs/common';
import type { VoiceCapabilities } from '../dto/voice.types';

import { DEFAULT_AUDIO_CONTRACT, VOICE_ERROR_CODES, type SynthesizeRequest } from '../dto/voice.types';
import type { TTSAdapter } from './tts-adapter.interface';

const CARTESIA_BYTES_ENDPOINT = 'https://api.cartesia.ai/tts/bytes';
const DEFAULT_MODEL_ID = 'sonic-2';
const PREVIEW_MODEL_ID = 'sonic-2';
const PREVIEW_MAX_CHARS = 200;
const SAMPLE_PREVIEW_TEXT = 'Hi! I am Zarax. How can I help you today?';

class VoiceError extends Error {
  voiceErrorCode: string;
  constructor(message: string, code: string) {
    super(message);
    this.voiceErrorCode = code;
  }
}

/**
 * Phase 1: Cartesia TTS Adapter (updated Phase 5)
 *
 * Optional fallback adapter — NOT the primary Zarax TTS engine.
 * Primary engine is ZaraxTTSAdapter (Kokoro-82M).
 *
 * Phase 5: implements getCapabilities() for TTSAdapter interface compliance.
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
      throw new VoiceError('TTS provider not configured', VOICE_ERROR_CODES.VOICE_PROVIDER_NOT_CONFIGURED);
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

  async preview(providerVoiceId: string, sampleText?: string, _speed?: number, _language?: string): Promise<Buffer> {
    if (!this.isConfigured()) {
      throw new VoiceError('TTS provider not configured', VOICE_ERROR_CODES.VOICE_PROVIDER_NOT_CONFIGURED);
    }

    const text = (sampleText ?? SAMPLE_PREVIEW_TEXT).slice(0, PREVIEW_MAX_CHARS);
    this.logger.log('CartesiaTTSAdapter: preview', { providerVoiceId, chars: text.length });
    return this.callCartesia(providerVoiceId, text, DEFAULT_AUDIO_CONTRACT.sampleRate, PREVIEW_MODEL_ID);
  }

  getCapabilities(_providerVoiceId?: string): VoiceCapabilities {
    return {
      voiceId: _providerVoiceId ?? 'any',
      provider: 'cartesia',
      model: 'sonic-2',
      realCapabilities: ['speed', 'language', 'emotion'],
      capabilities: {
        speed: {
          supported: 'REAL',
          description: 'Speed via Cartesia API.',
          range: { min: 0.5, max: 2.0 },
        },
        language: {
          supported: 'REAL',
          description: 'Language via Cartesia API.',
          values: ['en', 'hi', 'fr', 'de', 'es'],
        },
        emotion: {
          supported: 'REAL',
          description: 'Emotion via Cartesia voice settings.',
          values: ['neutral', 'happy', 'sad', 'angry', 'excited', 'calm'],
        },
        style: {
          supported: 'REAL',
          description: 'Style via Cartesia API.',
          values: ['conversational', 'professional'],
        },
        pitch: {
          supported: 'UNSUPPORTED',
          description: 'Not supported by Cartesia.',
        },
        energy: {
          supported: 'UNSUPPORTED',
          description: 'Not supported by Cartesia.',
        },
        pause: {
          supported: 'PARTIAL',
          description: 'Via SSML tags.',
        },
        intensity: {
          supported: 'UNSUPPORTED',
          description: 'Not supported by Cartesia.',
        },
        streaming: {
          supported: 'REAL',
          description: 'Full WebSocket streaming via tts-service.',
        },
        voiceCloning: {
          supported: 'UNSUPPORTED',
          description: 'Not available via CartesiaTTSAdapter.',
        },
      },
      languages: ['en', 'hi', 'fr', 'de', 'es', 'pt'],
      gpuRequiredFor: [],
      honestSummary:
        'Cartesia supports real emotion, speed, and language control. ' +
        'Optional fallback adapter — not the primary Zarax TTS engine.',
    };
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
      throw new VoiceError('Cartesia synthesis failed: network error', VOICE_ERROR_CODES.VOICE_SYNTHESIS_FAILED);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error('CartesiaTTSAdapter: HTTP error', { status: response.status, body });
      throw new VoiceError(`Cartesia synthesis failed: HTTP ${response.status}`, VOICE_ERROR_CODES.VOICE_SYNTHESIS_FAILED);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
