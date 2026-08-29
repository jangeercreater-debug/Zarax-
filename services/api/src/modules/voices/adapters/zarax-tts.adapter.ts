import { Injectable, Logger } from '@nestjs/common';

import {
  DEFAULT_AUDIO_CONTRACT,
  VOICE_ERROR_CODES,
  type SynthesizeRequest,
} from '../dto/voice.types';
import type { TTSAdapter } from './tts-adapter.interface';

/**
 * Phase 2: Zarax TTS Adapter
 *
 * Connects VoiceEngineService to the Zarax TTS Inference Service
 * (services/zarax-tts-inference — Kokoro-82M, Apache 2.0).
 *
 * Architecture:
 *   VoiceEngineService → ZaraxTTSAdapter → zarax-tts-inference → Kokoro-82M
 *
 * The inference service is internal — never exposed publicly.
 * Multi-tenancy and RBAC are enforced by VoiceEngineService before
 * this adapter is called.
 *
 * Future: Phase 7 replaces Kokoro with the Zarax proprietary model
 * by updating the inference service — this adapter code stays unchanged.
 */

const DEFAULT_SAMPLE_TEXT_EN = 'Hi! I am Zarax. How can I help you today?';
const DEFAULT_SAMPLE_TEXT_HI = 'Namaste! Main Zarax hoon. Aapki kya madad kar sakti hoon?';
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

    this.logger.log('ZaraxTTSAdapter: synthesize', {
      requestId: request.requestId,
      voiceId: request.voiceId,
      providerVoiceId,
      chars: text.length,
      format,
    });

    return this.callInferenceService('/synthesize', {
      text,
      voice_id: providerVoiceId,
      language: request.language,
      speed: request.speed ?? 1.0,
      format,
      request_id: request.requestId,
    }, SYNTHESIS_TIMEOUT_MS);
  }

  async preview(providerVoiceId: string, sampleText?: string): Promise<Buffer> {
    if (!this.isConfigured()) {
      throw new TtsError(
        'Zarax TTS Inference Service URL not configured.',
        VOICE_ERROR_CODES.VOICE_PROVIDER_NOT_CONFIGURED,
      );
    }

    // Pick sample text based on voice language
    const isHindi = providerVoiceId.startsWith('zarax_hindi') ||
      providerVoiceId.includes('hf_') ||
      providerVoiceId.includes('hm_');

    const text = (sampleText ?? (isHindi ? DEFAULT_SAMPLE_TEXT_HI : DEFAULT_SAMPLE_TEXT_EN))
      .slice(0, PREVIEW_MAX_CHARS);

    this.logger.log('ZaraxTTSAdapter: preview', { providerVoiceId, chars: text.length });

    return this.callInferenceService('/synthesize', {
      text,
      voice_id: providerVoiceId,
      speed: 1.0,
      format: 'wav',
    }, PREVIEW_TIMEOUT_MS);
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
        const data = await res.json() as { ready?: boolean; model?: string };
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
      } catch { /* ignore parse errors */ }

      if (response.status === 503) errCode = VOICE_ERROR_CODES.VOICE_PROVIDER_NOT_CONFIGURED;

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
