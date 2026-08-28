/**
 * Phase 1: Voice Engine Foundation
 *
 * Core domain types for the Zarax Voice Engine.
 * These types define the public contract between the application
 * and the Voice Engine — independent of any specific TTS provider.
 *
 * Future phases add: GENERATED, CLONED, CUSTOM, MARKETPLACE voice types
 * and replace the CartesiaTTSAdapter with ZaraxTTSAdapter.
 */

// ─── Enums ──────────────────────────────────────────────────────────────────

export type VoiceType = 'SYSTEM' | 'GENERATED' | 'CLONED' | 'CUSTOM' | 'MARKETPLACE';
export type VoiceGender = 'MALE' | 'FEMALE' | 'NEUTRAL';
export type VoiceStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING';

// ─── Audio Contract ──────────────────────────────────────────────────────────

/**
 * Phase 1 audio contract — defines the internal audio format used
 * across Zarax voice pipeline. Must remain compatible with:
 * - LiveKit (PCM, 24kHz for GPT-Realtime / 48kHz for Cartesia stream)
 * - voice-runtime TtsClient (WebSocket binary frames, pcm_s16le)
 * - OpenAI Realtime (PCM16, 24kHz)
 * Do NOT change encoding/sampleRate without updating voice-runtime.
 */
export interface AudioContract {
  /** Raw audio encoding. pcm_s16le = signed 16-bit little-endian PCM. */
  encoding: 'pcm_s16le' | 'opus' | 'mp3' | 'wav';
  /** Samples per second. 24000 for GPT-Realtime, 48000 for Cartesia stream. */
  sampleRate: 24000 | 48000;
  /** Mono = 1 (voice calls). Stereo = 2 (future music/background). */
  channels: 1 | 2;
  /** Maximum single synthesis payload in bytes (~30s at 24kHz PCM16 mono). */
  maxPayloadBytes: number;
}

export const DEFAULT_AUDIO_CONTRACT: AudioContract = {
  encoding: 'pcm_s16le',
  sampleRate: 24000,
  channels: 1,
  maxPayloadBytes: 1_440_000, // 30 seconds at 24kHz PCM16 mono
};

// ─── Voice Engine Request/Response ──────────────────────────────────────────

export interface SynthesizeRequest {
  /** Text to synthesize. Max 5000 chars. */
  text: string;
  /** Voice Registry voice ID (our internal UUID, not provider ID). */
  voiceId: string;
  /** BCP-47 language tag. Defaults to voice's primary language. */
  language?: string;
  /** Speaking style hint. Provider may ignore if unsupported. */
  style?: string;
  /** Emotion hint. Provider may ignore if unsupported. */
  emotion?: string;
  /** Speed multiplier 0.5–2.0. Provider may ignore if unsupported. */
  speed?: number;
  /** Pitch adjustment. Provider may ignore if unsupported. */
  pitch?: number;
  /** Desired output format. Defaults to DEFAULT_AUDIO_CONTRACT. */
  outputFormat?: Partial<AudioContract>;
  /** Correlation ID for distributed tracing. */
  requestId?: string;
}

export interface SynthesizeResponse {
  requestId: string;
  /** Our internal voice ID (not provider ID). */
  voiceId: string;
  /** Provider-level voice ID used for actual synthesis. */
  providerVoiceId: string;
  provider: string;
  audioFormat: AudioContract;
  /** Duration in seconds if known (not always available from providers). */
  durationSeconds?: number;
  /** For REST-style delivery: pre-signed URL to download audio. */
  audioUrl?: string;
}

// ─── Voice Registry Types ────────────────────────────────────────────────────

export interface VoiceRecord {
  id: string;
  tenantId: string | null;
  name: string;
  description: string | null;
  voiceType: VoiceType;
  gender: VoiceGender;
  language: string;
  languages: string[];
  accent: string | null;
  ageRange: string | null;
  style: string | null;
  defaultEmotion: string | null;
  provider: string | null;
  providerVoiceId: string | null;
  model: string | null;
  speakerId: string | null;
  status: VoiceStatus;
  isPublic: boolean;
  isDefault: boolean;
  metadata: Record<string, unknown> | null;
  sampleAudioUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Voice Engine Error Codes ────────────────────────────────────────────────

/**
 * Voice Engine specific error detail codes.
 * These are used as `details.voiceErrorCode` inside AppError,
 * not as top-level ErrorCode (which remains the existing shared enum).
 */
export const VOICE_ERROR_CODES = {
  VOICE_NOT_FOUND: 'VOICE_NOT_FOUND',
  VOICE_ACCESS_DENIED: 'VOICE_ACCESS_DENIED',
  VOICE_INACTIVE: 'VOICE_INACTIVE',
  VOICE_PROVIDER_NOT_CONFIGURED: 'VOICE_PROVIDER_NOT_CONFIGURED',
  VOICE_MODEL_NOT_CONFIGURED: 'VOICE_MODEL_NOT_CONFIGURED',
  VOICE_SYNTHESIS_FAILED: 'VOICE_SYNTHESIS_FAILED',
  VOICE_INVALID_PARAMETERS: 'VOICE_INVALID_PARAMETERS',
  VOICE_UNSUPPORTED_FORMAT: 'VOICE_UNSUPPORTED_FORMAT',
  VOICE_PREVIEW_UNAVAILABLE: 'VOICE_PREVIEW_UNAVAILABLE',
  VOICE_TENANT_LIMIT_EXCEEDED: 'VOICE_TENANT_LIMIT_EXCEEDED',
} as const;

export type VoiceErrorCode = (typeof VOICE_ERROR_CODES)[keyof typeof VOICE_ERROR_CODES];
