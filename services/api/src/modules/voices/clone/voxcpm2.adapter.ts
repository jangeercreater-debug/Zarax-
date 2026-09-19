/**
 * VoxCPM2 TTS Adapter — Phase 7.4
 *
 * Experimental adapter for Hindi/Hinglish TTS via VoxCPM2.
 *
 * Model: openbmb/VoxCPM2 (Apache 2.0 — commercial-safe)
 * License verified: https://github.com/OpenBMB/VoxCPM (Apache-2.0)
 *
 * IMPORTANT:
 * - Standard TTS only. User voice cloning UNSUPPORTED / UNTESTED.
 * - AudioContract: pcm_s16le / 24kHz / mono — enforced by Modal service.
 * - Feature flag: VOXCPM2_TTS_ENABLED=false (disabled by default).
 * - Chatterbox production path is UNCHANGED.
 */

import { Injectable, Logger } from '@nestjs/common';

export interface VoxCPM2SynthesisResult {
  audioBuffer: Buffer;
  durationS: number;
  latencyMs: number;
  language: string;
  warnings: string[];
  voiceCloning: false; // Always false — not cloned user voice
}

@Injectable()
export class VoxCPM2Adapter {
  private readonly logger = new Logger(VoxCPM2Adapter.name);
  private readonly serviceUrl: string;
  private readonly serviceToken: string;
  private readonly timeoutMs = 90_000; // 90s — GPU cold start + synthesis

  constructor() {
    this.serviceUrl = (process.env.ZARAX_VOXCPM2_SERVICE_URL ?? '').replace(/\/$/, '');
    this.serviceToken = process.env.ZARAX_VOXCPM2_SERVICE_TOKEN ?? '';
  }

  isAvailable(): boolean {
    return this.serviceUrl.length > 0 && this.serviceToken.length > 0;
  }

  async synthesize(
    text: string,
    language: 'hindi' | 'hinglish' | 'english',
    requestId: string,
  ): Promise<VoxCPM2SynthesisResult> {
    if (!this.isAvailable()) {
      throw new Error('VoxCPM2 service not configured (ZARAX_VOXCPM2_SERVICE_URL/TOKEN missing)');
    }

    const url = `${this.serviceUrl}/synthesize`;
    this.logger.log('VoxCPM2Adapter: synthesize', { requestId, language, chars: text.length });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          language,
          request_id: requestId,
          token: this.serviceToken,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const errBody = await response.text().catch(() => 'unknown error');
      throw new Error(`VoxCPM2 synthesis failed HTTP ${response.status}: ${errBody}`);
    }

    const data = await response.json() as {
      audio_base64: string;
      sample_rate: number;
      channels: number;
      format: string;
      duration_s: number;
      latency_ms: number;
      language: string;
      warnings: string[];
      voice_cloning: boolean;
    };

    // Validate AudioContract compliance
    if (data.sample_rate !== 24000) {
      throw new Error(`AudioContract violation: expected 24000Hz, got ${data.sample_rate}Hz`);
    }
    if (data.channels !== 1) {
      throw new Error(`AudioContract violation: expected mono, got ${data.channels} channels`);
    }
    if (data.format !== 'pcm_s16le') {
      throw new Error(`AudioContract violation: expected pcm_s16le, got ${data.format}`);
    }

    const audioBuffer = Buffer.from(data.audio_base64, 'base64');

    if (audioBuffer.length === 0) {
      throw new Error('VoxCPM2 returned empty audio buffer');
    }

    this.logger.log('VoxCPM2Adapter: synthesis complete', {
      requestId,
      durationS: data.duration_s,
      latencyMs: data.latency_ms,
      bytes: audioBuffer.length,
      warnings: data.warnings,
    });

    return {
      audioBuffer,
      durationS: data.duration_s,
      latencyMs: data.latency_ms,
      language: data.language,
      warnings: data.warnings,
      voiceCloning: false,
    };
  }
}
