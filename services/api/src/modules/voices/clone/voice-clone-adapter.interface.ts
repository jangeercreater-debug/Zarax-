/**
 * Phase 4: VoiceCloneAdapter Interface
 *
 * Abstracts the cloning model behind a clean boundary.
 * Current implementation: ChatterboxAdapter (GPU synthesis unavailable)
 * Future (Phase 6): Real Chatterbox Multilingual V3 GPU inference
 *
 * Architecture:
 *   VoiceCloneController
 *         ↓
 *   VoiceCloneService
 *         ↓
 *   VoiceCloneAdapter (this interface)
 *         ↓
 *   ChatterboxAdapter
 *         ↓
 *   Chatterbox Inference Service (Phase 6 — GPU required)
 */

export interface CloneRequest {
  /** Raw audio buffer (decoded from base64) */
  audioBuffer: Buffer;
  audioMimeType: string;
  audioDurationS: number;
  /** BCP-47 language tag of the reference audio */
  language?: string;
}

export interface CloneResult {
  /** Speaker embedding as base64 encoded float32 array */
  embeddingData: string;
  /** Embedding dimension (e.g. 256 for Chatterbox speaker encoder) */
  embeddingDim: number;
  /** Model used to extract embedding */
  embeddingModel: string;
  /** True only when actual synthesis is possible */
  synthesisAvailable: boolean;
  /** Reason synthesis is not available (if applicable) */
  synthesisUnavailableReason?: string;
}

export interface SynthesizeFromCloneRequest {
  text: string;
  profile: VoiceCloneProfile;
  speed?: number;
  language?: string;
}

export interface VoiceCloneAdapter {
  readonly adapterId: string;
  readonly modelName: string;
  readonly modelVersion: string;
  readonly license: string;

  /**
   * Extract speaker embedding from reference audio.
   * Returns embedding metadata even when synthesis is unavailable.
   * Never returns fake embeddings — throws if extraction fails.
   */
  extractEmbedding(request: CloneRequest): Promise<CloneResult>;

  /**
   * Synthesize speech using a cloned voice profile.
   * MUST throw CLONE_SYNTHESIS_UNAVAILABLE when GPU is not available.
   * MUST NOT return fake/placeholder audio.
   */
  synthesizeFromClone(request: SynthesizeFromCloneRequest): Promise<Buffer>;
  export interface SynthesizeFromCloneRequest {
  text: string;
  profile: VoiceCloneProfile;
  speed?: number;
  language?: string;
  requestId?: string;
  /** Phase 5 VoiceExpression spec — consumed by Chatterbox emotion exaggeration */
  expression?: {
    emotion?: string;
    style?: string;
    energy?: number;
    intensity?: number;
    pitch?: number;
  };
  }

  /** True only when actual GPU synthesis is available. */
  isSynthesisAvailable(): boolean;

  /** Health check — checks inference service connectivity. */
  healthCheck(): Promise<{ healthy: boolean; synthesisAvailable: boolean; reason?: string }>;
}

// ─── Placeholder profile type for adapter interface ───────────────────────────
export interface VoiceCloneProfile {
  id: string;
  embeddingData: string | null;
  embeddingDim: number | null;
  embeddingModel: string | null;
  audioMimeType: string;
  /** Reference audio for Chatterbox zero-shot conditioning (base64 encoded) */
  audioDataBase64?: string | null;
}
