import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';

import {
  CLONE_ERROR_CODES,
  CLONING_MODEL_METADATA,
  SYNTHESIS_UNAVAILABLE_MESSAGE,
} from './voice-clone.types';
import type {
  CloneRequest,
  CloneResult,
  SynthesizeFromCloneRequest,
  VoiceCloneAdapter,
} from './voice-clone-adapter.interface';

/**
 * Phase 6: Chatterbox Multilingual V3 Adapter (updated)
 *
 * Now wires to the real Modal GPU inference service when
 * ZARAX_CLONE_SERVICE_URL is configured.
 *
 * CURRENT STATE:
 *   - extractEmbedding(): stores reference audio + SHA256 fingerprint
 *     Real Chatterbox embedding is extracted at synthesis time from stored audio.
 *   - synthesizeFromClone(): calls Modal GPU service → Chatterbox → real audio
 *
 * IMPORTANT:
 *   - Modal provides GPU infrastructure ONLY.
 *   - Speech generation happens inside OUR Chatterbox container.
 *   - No third-party TTS API is used.
 *   - Never return fake audio — throws CLONE_SYNTHESIS_UNAVAILABLE if GPU not configured.
 *
 * Model: Chatterbox Multilingual V3 (ResembleAI/chatterbox, MIT license)
 * VRAM: ~2-3GB on T4 GPU
 * Audio: 24kHz WAV — matches Phase 1 AudioContract exactly
 */
@Injectable()
export class ChatterboxAdapter implements VoiceCloneAdapter {
  readonly adapterId = 'chatterbox';
  readonly modelName = CLONING_MODEL_METADATA.model;
  readonly modelVersion = CLONING_MODEL_METADATA.version;
  readonly license = CLONING_MODEL_METADATA.license;

  private readonly logger = new Logger(ChatterboxAdapter.name);
  private readonly cloneServiceUrl = (process.env.ZARAX_CLONE_SERVICE_URL ?? '').replace(/\/$/, '');
  private readonly cloneServiceToken = process.env.ZARAX_CLONE_SERVICE_TOKEN ?? '';
  private readonly synthesisTimeoutMs = 90_000; // 90s — GPU cold start + synthesis

  isSynthesisAvailable(): boolean {
    return this.cloneServiceUrl.length > 0 && this.cloneServiceToken.length > 0;
  }

  async extractEmbedding(request: CloneRequest): Promise<CloneResult> {
    this.logger.log('ChatterboxAdapter: extractEmbedding', {
      mimeType: request.audioMimeType,
      durationS: request.audioDurationS,
    });

    // Phase 6: audio stored in VoiceCloneProfile.audioDataBase64
    // Real Chatterbox speaker conditioning happens at synthesis time
    // using the stored reference audio — no separate embedding extraction needed
    // (Chatterbox uses zero-shot conditioning directly from reference audio)
    const audioHash = createHash('sha256').update(request.audioBuffer).digest('hex');
    const metaString = `${audioHash}:${request.audioMimeType}:${request.audioDurationS.toFixed(2)}`;
    const fingerprint = createHash('sha256').update(metaString).digest('base64');

    const synthesisAvail = this.isSynthesisAvailable();

    this.logger.log('ChatterboxAdapter: profile fingerprint created', {
      embeddingModel: synthesisAvail ? 'chatterbox-reference-audio-v1' : 'sha256-fingerprint-v1',
      synthesisAvailable: synthesisAvail,
    });

    return {
      embeddingData: fingerprint,
      embeddingDim: 1,
      embeddingModel: synthesisAvail
        ? 'chatterbox-reference-audio-v1'
        : 'sha256-fingerprint-v1',
      synthesisAvailable: synthesisAvail,
      synthesisUnavailableReason: synthesisAvail
        ? undefined
        : CLONING_MODEL_METADATA.synthesisBlockedReason,
    };
  }

  async synthesizeFromClone(request: SynthesizeFromCloneRequest): Promise<Buffer> {
    if (!this.isSynthesisAvailable()) {
      this.logger.warn('ChatterboxAdapter: synthesis unavailable — ZARAX_CLONE_SERVICE_URL not set');
      throw Object.assign(new Error(SYNTHESIS_UNAVAILABLE_MESSAGE), {
        cloneErrorCode: CLONE_ERROR_CODES.CLONE_SYNTHESIS_UNAVAILABLE,
        synthesisAvailable: false,
        gpuRequired: true,
        model: CLONING_MODEL_METADATA.model,
      });
    }

    if (!request.profile.audioDataBase64) {
      throw Object.assign(
        new Error('Reference audio not available in voice profile. Please re-upload the voice recording.'),
        { cloneErrorCode: CLONE_ERROR_CODES.CLONE_PROCESSING_FAILED },
      );
    }

    // Map VoiceExpression to Chatterbox params
    // emotion → exaggeration (REAL Chatterbox feature)
    // speed → post-processing (Chatterbox V3 does not expose speed directly)
    const exaggeration = this.emotionToExaggeration(request.expression?.emotion);
    const speed = request.speed ?? 1.0;

    this.logger.log('ChatterboxAdapter: synthesizeFromClone calling GPU service', {
      requestId: request.requestId,
      exaggeration,
      speed,
      textLen: request.text.length,
      hasReferenceAudio: true,
      // Never log: text content, audio data, tokens
    });

    let response: Response;
    try {
      response = await fetch(`${this.cloneServiceUrl}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: this.cloneServiceToken,
          text: request.text.slice(0, 1000),
          audio_ref_base64: request.profile.audioDataBase64,
          language: request.language ?? 'en',
          exaggeration,
          speed,
          format: 'wav',
          request_id: request.requestId ?? 'unknown',
        }),
        signal: AbortSignal.timeout(this.synthesisTimeoutMs),
      });
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === 'TimeoutError';
      this.logger.error('ChatterboxAdapter: GPU service network error', {
        isTimeout,
        errorType: error instanceof Error ? error.name : 'unknown',
      });
      throw Object.assign(
        new Error(isTimeout ? 'GPU synthesis timed out.' : 'GPU service unreachable.'),
        { cloneErrorCode: CLONE_ERROR_CODES.CLONE_SYNTHESIS_UNAVAILABLE },
      );
    }

    if (!response.ok) {
      let errCode = CLONE_ERROR_CODES.CLONE_PROCESSING_FAILED;
      let errMsg = `GPU service returned HTTP ${response.status}`;
      try {
        const body = await response.json() as { detail?: { code?: string; message?: string } };
        if (body.detail?.code) errCode = body.detail.code as never;
        if (body.detail?.message) errMsg = body.detail.message;
      } catch { /* ignore */ }

      if (response.status === 401) errCode = CLONE_ERROR_CODES.CLONE_ACCESS_DENIED;
      if (response.status === 503) errCode = CLONE_ERROR_CODES.CLONE_SYNTHESIS_UNAVAILABLE;

      this.logger.error('ChatterboxAdapter: GPU service error', {
        status: response.status,
        errCode,
      });
      throw Object.assign(new Error(errMsg), { cloneErrorCode: errCode });
    }

    const audioBuffer = await response.arrayBuffer();
    const durationS = response.headers.get('X-Duration-S') ?? 'unknown';
    const latencyS = response.headers.get('X-Latency-S') ?? 'unknown';

    this.logger.log('ChatterboxAdapter: synthesis complete', {
      requestId: request.requestId,
      durationS,
      latencyS,
      audioBytes: audioBuffer.byteLength,
    });

    return Buffer.from(audioBuffer);
  }

  async healthCheck(): Promise<{ healthy: boolean; synthesisAvailable: boolean; reason?: string }> {
    if (!this.isSynthesisAvailable()) {
      return {
        healthy: true,
        synthesisAvailable: false,
        reason: 'ZARAX_CLONE_SERVICE_URL or ZARAX_CLONE_SERVICE_TOKEN not configured.',
      };
    }

    try {
      const readyUrl = this.cloneServiceUrl.replace('/synthesize', '/ready')
        .replace(/zarax-clone-synthesize.*/, 'zarax-clone-ready');
      const res = await fetch(readyUrl, { signal: AbortSignal.timeout(5000) });
      return {
        healthy: res.ok,
        synthesisAvailable: res.ok,
        reason: res.ok ? undefined : `GPU service returned HTTP ${res.status}`,
      };
    } catch (error) {
      return {
        healthy: false,
        synthesisAvailable: false,
        reason: error instanceof Error ? error.message : 'GPU service unreachable',
      };
    }
  }

  /**
   * Map VoiceExpression.emotion to Chatterbox exaggeration parameter.
   * Chatterbox supports emotion exaggeration 0.0–1.0 (REAL capability).
   * Recommended range: 0.4–0.7
   */
  private emotionToExaggeration(emotion?: string): number {
    const map: Record<string, number> = {
      neutral: 0.5,
      happy: 0.65,
      excited: 0.75,
      friendly: 0.6,
      confident: 0.55,
      empathetic: 0.5,
      calm: 0.4,
      serious: 0.45,
      sad: 0.4,
      angry: 0.7,
    };
    return map[emotion ?? 'neutral'] ?? 0.5;
  }
  }
