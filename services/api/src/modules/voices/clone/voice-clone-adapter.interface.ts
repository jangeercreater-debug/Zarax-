/**
 * Phase 1: VoiceCloneAdapter Interface
 * Phase 6: Updated with audioDataBase64 + VoiceExpression support
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
 *   Modal GPU — Chatterbox Multilingual V3 (MIT)
 */

export interface CloneRequest {
  audioBuffer: Buffer;
  audioMimeType: string;
  audioDurationS: number;
  language?: string;
}

export interface CloneResult {
  embeddingData: string;
  embeddingDim: number;
  embeddingModel: string;
  synthesisAvailable: boolean;
  synthesisUnavailableReason?: string;
}

export interface VoiceCloneProfile {
  id: string;
  embeddingData: string | null;
  embeddingDim: number | null;
  embeddingModel: string | null;
  audioMimeType: string;
  /** Reference audio for Chatterbox zero-shot conditioning */
  audioDataBase64?: string | null;
}

export interface SynthesizeFromCloneRequest {
  text: string;
  profile: VoiceCloneProfile;
  speed?: number;
  language?: string;
  requestId?: string;
  /** Phase 5 VoiceExpression spec — emotion maps to Chatterbox exaggeration param */
  expression?: {
    emotion?: string;
    style?: string;
    energy?: number;
    intensity?: number;
    pitch?: number;
  };
}

export interface VoiceCloneAdapter {
  readonly adapterId: string;
  readonly modelName: string;
  readonly modelVersion: string;
  readonly license: string;

  extractEmbedding(request: CloneRequest): Promise<CloneResult>;

  synthesizeFromClone(request: SynthesizeFromCloneRequest): Promise<Buffer>;

  isSynthesisAvailable(): boolean;

  healthCheck(): Promise<{ healthy: boolean; synthesisAvailable: boolean; reason?: string }>;
}
