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
 * Phase 4: Chatterbox Multilingual V3 Adapter
 *
 * CURRENT STATE (Phase 4):
 *   - extractEmbedding(): Creates a deterministic profile fingerprint from audio
 *     metadata (SHA256-based). Real Chatterbox embedding extraction requires GPU.
 *   - synthesizeFromClone(): Always throws CLONE_SYNTHESIS_UNAVAILABLE.
 *     NEVER returns fake audio.
 *
 * PHASE 6 STATE (when GPU inference service is available):
 *   - extractEmbedding(): Calls GPU inference service to extract real 256-dim
 *     Chatterbox speaker embedding from reference audio.
 *   - synthesizeFromClone(): Calls GPU inference service for real synthesis.
 *
 * Architecture:
 *   ChatterboxAdapter → ZARAX_CLONE_SERVICE_URL → Chatterbox GPU Service
 *
 * The GPU service URL is intentionally NOT configured in Phase 4.
 * Attempting to enable synthesis without GPU will throw CLONE_SYNTHESIS_UNAVAILABLE.
 */
@Injectable()
export class ChatterboxAdapter implements VoiceCloneAdapter {
  readonly adapterId = 'chatterbox';
  readonly modelName = CLONING_MODEL_METADATA.model;
  readonly modelVersion = CLONING_MODEL_METADATA.version;
  readonly license = CLONING_MODEL_METADATA.license;

  private readonly logger = new Logger(ChatterboxAdapter.name);
  private readonly cloneServiceUrl = process.env.ZARAX_CLONE_SERVICE_URL ?? '';

  isSynthesisAvailable(): boolean {
    // Synthesis requires GPU inference service — not available until Phase 6
    return this.cloneServiceUrl.length > 0 && CLONING_MODEL_METADATA.synthesisAvailable;
  }

  async extractEmbedding(request: CloneRequest): Promise<CloneResult> {
    this.logger.log('ChatterboxAdapter: extractEmbedding', {
      mimeType: request.audioMimeType,
      durationS: request.audioDurationS,
      // Never log audio content or size beyond metadata
    });

    if (this.isSynthesisAvailable()) {
      // Phase 6: Call real GPU inference service
      return this.callGpuEmbeddingExtraction(request);
    }

    // Phase 4: Create deterministic profile fingerprint from audio metadata.
    // This is NOT a real speaker embedding — it is a placeholder that:
    //   1. Records that audio was received and validated
    //   2. Stores audio hash for integrity verification
    //   3. Will be replaced with real Chatterbox embedding in Phase 6
    const audioHash = createHash('sha256').update(request.audioBuffer).digest('hex');
    const metadataString = `${audioHash}:${request.audioMimeType}:${request.audioDurationS.toFixed(2)}`;
    const profileFingerprint = createHash('sha256').update(metadataString).digest('base64');

    this.logger.log('ChatterboxAdapter: profile fingerprint created (GPU not available)', {
      embeddingModel: 'sha256-fingerprint-v1',
      embeddingDim: 1,
    });

    return {
      embeddingData: profileFingerprint,
      embeddingDim: 1, // Placeholder — real Chatterbox embedding is 256-dim
      embeddingModel: 'sha256-fingerprint-v1',
      synthesisAvailable: false,
      synthesisUnavailableReason: CLONING_MODEL_METADATA.synthesisBlockedReason,
    };
  }

  async synthesizeFromClone(_request: SynthesizeFromCloneRequest): Promise<Buffer> {
    // CRITICAL: Never return fake audio.
    // This method MUST throw until real GPU synthesis is available.
    this.logger.warn('ChatterboxAdapter: synthesizeFromClone called but synthesis unavailable', {
      reason: CLONING_MODEL_METADATA.synthesisBlockedReason,
    });

    const err = new Error(SYNTHESIS_UNAVAILABLE_MESSAGE);
    (err as Record<string, unknown>)['cloneErrorCode'] = CLONE_ERROR_CODES.CLONE_SYNTHESIS_UNAVAILABLE;
    (err as Record<string, unknown>)['synthesisAvailable'] = false;
    (err as Record<string, unknown>)['gpuRequired'] = true;
    (err as Record<string, unknown>)['model'] = CLONING_MODEL_METADATA.model;
    throw err;
  }

  async healthCheck(): Promise<{ healthy: boolean; synthesisAvailable: boolean; reason?: string }> {
    if (!this.cloneServiceUrl) {
      return {
        healthy: true, // Service itself is healthy — GPU inference is just not configured
        synthesisAvailable: false,
        reason: 'ZARAX_CLONE_SERVICE_URL not configured. Phase 6 GPU inference service required for synthesis.',
      };
    }

    try {
      const res = await fetch(`${this.cloneServiceUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return {
        healthy: res.ok,
        synthesisAvailable: this.isSynthesisAvailable(),
        reason: res.ok ? undefined : `Clone service returned HTTP ${res.status}`,
      };
    } catch (error) {
      return {
        healthy: false,
        synthesisAvailable: false,
        reason: error instanceof Error ? error.message : 'Clone service unreachable',
      };
    }
  }

  private async callGpuEmbeddingExtraction(_request: CloneRequest): Promise<CloneResult> {
    // Phase 6 implementation — GPU inference service call
    // Will call: POST ${ZARAX_CLONE_SERVICE_URL}/extract-embedding
    // Returns: real 256-dim Chatterbox speaker embedding
    throw new Error('GPU embedding extraction not yet implemented (Phase 6)');
  }
}
