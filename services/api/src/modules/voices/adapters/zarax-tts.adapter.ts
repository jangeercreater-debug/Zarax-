import { Injectable, Logger } from '@nestjs/common';

import {
  KOKORO_LANGUAGE_MAP,
  VOICE_ERROR_CODES,
  type SynthesizeRequest,
  type VoiceCapabilities,
} from '../dto/voice.types';
import type { TTSAdapter } from './tts-adapter.interface';

const DEFAULT_SAMPLE_TEXT_EN = 'Hello! I am Zarax. How can I help you today?';
const DEFAULT_SAMPLE_TEXT_HI = 'Namaste! Main Zarax hoon. Aapki kaise madad kar sakti hoon?';
const PREVIEW_MAX_CHARS = 200;
const SYNTHESIS_TIMEOUT_MS = 30_000;
const PREVIEW_TIMEOUT_MS = 15_000;

class TtsError extends Error {
  voiceErrorCode: string;
  constructor(message: string, code: string) {
    super(message);
    this.voiceErrorCode = code;
  }
}

@Injectable()
export class ZaraxTTSAdapter implements TTSAdapter {
  readonly providerId = 'zarax';
  private readonly logger = new Logger(ZaraxTTSAdapter.name);
  private readonly serviceUrl: string;
  private readonly internalToken: string;

  constructor() {
    this.serviceUrl = (process.env.ZARAX_TTS_SERVICE_URL ?? '').replace(/\/$/, '');
    this.internalToken = process.env.ZARAX_TTS_INTERNAL_TOKEN ?? '';
  }

  isConfigured(): boolean {
    return this.serviceUrl.length > 0;
  }

  async synthesize(request: SynthesizeRequest, providerVoiceId: string): Promise<Buffer> {
    if (!this.isConfigured()) {
      throw new TtsError(
        'Zarax TTS Inference Service URL not configured (ZARAX_TTS_SERVICE_URL).',
        VOICE_ERROR_CODES.VOICE_PROVIDER_NOT_CONFIGURED,
      );
    }

    const text = request.text.slice(0, 5000);
    const format = request.outputFormat?.encoding === 'pcm_s16le' ? 'pcm' : 'wav';
    const speed = this.clampSpeed(request.speed ?? 1.0);
    const langCode = request.language
      ? (KOKORO_LANGUAGE_MAP[request.language] ?? 'a')
      : undefined;

    this.logger.log('ZaraxTTSAdapter: synthesize', {
      requestId: request.requestId,
      voiceId: request.voiceId,
      providerVoiceId,
      chars: text.length,
      speed,
      langCode,
      emotion: request.emotion ?? 'neutral (spec only)',
    });

    return this.callInferenceService('/synthesize', {
      text,
      voice_id: providerVoiceId,
      language: langCode,
      speed,
      format,
      request_id: request.requestId,
    }, SYNTHESIS_TIMEOUT_MS);
  }

  async preview(providerVoiceId: string, sampleText?: string, speed?: number, language?: string): Promise<Buffer> {
    if (!this.isConfigured()) {
      throw new TtsError(
        'Zarax TTS Inference Service URL not configured.',
        VOICE_ERROR_CODES.VOICE_PROVIDER_NOT_CONFIGURED,
      );
    }

    const isHindi = providerVoiceId.includes('hindi') ||
      providerVoiceId.includes('hf_') ||
      providerVoiceId.includes('hm_');

    const defaultText = isHindi ? DEFAULT_SAMPLE_TEXT_HI : DEFAULT_SAMPLE_TEXT_EN;
    const text = (sampleText ?? defaultText).slice(0, PREVIEW_MAX_CHARS);
    const langCode = isHindi ? 'h' : 'a';

    this.logger.log('ZaraxTTSAdapter: preview', {
      providerVoiceId,
      chars: text.length,
      langCode,
    });

    // Phase 5: speed (REAL) and language (REAL) wired to Kokoro
    const finalSpeed = speed ? Math.min(Math.max(speed, 0.5), 2.0) : 1.0;
    const finalLangCode = language
      ? (KOKORO_LANGUAGE_MAP[language] ?? langCode)
      : langCode;

    return this.callInferenceService('/synthesize', {
      text,
      voice_id: providerVoiceId,
      speed: finalSpeed,
      lang_code_override: finalLangCode,
      format: 'wav',
    }, PREVIEW_TIMEOUT_MS);
  }

  getCapabilities(_providerVoiceId?: string): VoiceCapabilities {
    return {
      voiceId: _providerVoiceId ?? 'any',
      provider: 'zarax',
      model: 'kokoro-82m',
      realCapabilities: ['speed', 'language'],
      capabilities: {
        speed: {
          supported: 'REAL',
          description: 'Speaking rate — wired to Kokoro KPipeline speed= param.',
          range: { min: 0.5, max: 2.0 },
        },
        language: {
          supported: 'REAL',
          description: 'Language selection via Kokoro lang_code — English, Hindi, British English, Japanese, Chinese.',
          values: ['en', 'hi', 'en-GB', 'ja', 'zh'],
        },
        emotion: {
          supported: 'GPU_REQUIRED',
          description: 'Stored as expression spec. No audio effect on Kokoro. Real effect in Phase 6 GPU model.',
          values: ['neutral', 'happy', 'sad', 'angry', 'excited', 'calm', 'serious', 'empathetic', 'confident', 'friendly'],
        },
        style: {
          supported: 'GPU_REQUIRED',
          description: 'Stored as expression spec. No audio effect on Kokoro. Requires GPU model.',
          values: ['conversational', 'professional', 'storytelling', 'customer_support', 'narrator', 'assistant'],
        },
        pitch: {
          supported: 'GPU_REQUIRED',
          description: 'Not supported by Kokoro. Requires GPU model.',
          range: { min: -50, max: 50 },
        },
        energy: {
          supported: 'GPU_REQUIRED',
          description: 'Not supported by Kokoro. Requires GPU model.',
          range: { min: 0, max: 100 },
        },
        pause: {
          supported: 'PARTIAL',
          description: 'Partial via text punctuation (commas, periods add natural pauses).',
          values: ['short', 'medium', 'long'],
        },
        intensity: {
          supported: 'GPU_REQUIRED',
          description: 'Stored as spec. Requires GPU model.',
          range: { min: 0, max: 100 },
        },
        streaming: {
          supported: 'PARTIAL',
          description: 'Partial via chunked generation in Kokoro pipeline.',
        },
        voiceCloning: {
          supported: 'GPU_REQUIRED',
          description: 'Requires Chatterbox GPU service (Phase 6).',
        },
      },
      languages: ['en', 'en-US', 'en-GB', 'hi', 'hi-IN', 'ja', 'zh'],
      gpuRequiredFor: ['emotion', 'style', 'pitch', 'energy', 'intensity', 'voiceCloning'],
      honestSummary:
        'Kokoro-82M supports real speed control and language selection. ' +
        'Emotion, pitch, energy, and style are stored as expression specs ' +
        'and will produce real audio effects when Phase 6 GPU infrastructure is deployed.',
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; reason?: string }> {
    if (!this.isConfigured()) {
      return { healthy: false, reason: 'ZARAX_TTS_SERVICE_URL not configured' };
    }

    try {
      const res = await fetch(`${this.serviceUrl}/ready`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const data = await res.json() as { ready?: boolean };
        return { healthy: data.ready === true };
      }

      const err = await res.json().catch(() => ({})) as { detail?: { message?: string } };
      return {
        healthy: false,
        reason: err.detail?.message ?? `Inference service returned HTTP ${res.status}`,
      };
    } catch (error) {
      return {
        healthy: false,
        reason: error instanceof Error ? error.message : 'Inference service unreachable',
      };
    }
  }

  private clampSpeed(speed: number): number {
    return Math.min(Math.max(speed, 0.5), 2.0);
  }

  private async callInferenceService(
    path: string,
    body: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<Buffer> {
    let response: Response;

    try {
      response = await fetch(`${this.serviceUrl}${path}`, {
        method: 'POST',
        headers: { ...this.headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      this.logger.error('ZaraxTTSAdapter: network error', {
        message: error instanceof Error ? error.message : String(error),
      });
      throw new TtsError(
        'Zarax TTS Inference Service unreachable.',
        VOICE_ERROR_CODES.VOICE_SYNTHESIS_FAILED,
      );
    }

    if (!response.ok) {
      let errCode = VOICE_ERROR_CODES.VOICE_SYNTHESIS_FAILED;
      let errMsg = `Inference service returned HTTP ${response.status}`;

      try {
        const errBody = await response.json() as { detail?: { code?: string; message?: string } };
        if (errBody.detail?.code) errCode = errBody.detail.code as never;
        if (errBody.detail?.message) errMsg = errBody.detail.message;
      } catch { /* ignore */ }

      if (response.status === 503) errCode = VOICE_ERROR_CODES.VOICE_SYNTHESIS_FAILED;

      this.logger.error('ZaraxTTSAdapter: inference error', { status: response.status, errCode });
      throw new TtsError(errMsg, errCode);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {};
    if (this.internalToken) h['X-Internal-Token'] = this.internalToken;
    return h;
  }
}
