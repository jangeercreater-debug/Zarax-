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

  // ─── Phase 5: Voice Expression Model ─────────────────────────────────────────

/**
 * Engine-independent voice expression specification.
 *
 * IMPORTANT — Kokoro-82M actual support:
 *   speed:   REAL — wired to KPipeline speed= param
 *   language: REAL — wired to KPipeline lang_code= param
 *   emotion:  SPEC ONLY — no audio effect on Kokoro; forwarded to future GPU model
 *   pitch:    SPEC ONLY — not supported by Kokoro; forwarded to future GPU model
 *   energy:   SPEC ONLY — not supported by Kokoro; forwarded to future GPU model
 *   style:    SPEC ONLY — not supported by Kokoro; forwarded to future GPU model
 *   pause:    PARTIAL — text punctuation creates natural pauses
 *
 * When Phase 6 GPU infrastructure is deployed, all SPEC ONLY fields
 * will produce real audio effects via Chatterbox or Zarax model.
 */
export type VoiceEmotion =
  | 'neutral' | 'happy' | 'sad' | 'angry' | 'excited'
  | 'calm' | 'serious' | 'empathetic' | 'confident' | 'friendly';

export type VoiceStyle =
  | 'conversational' | 'professional' | 'storytelling'
  | 'customer_support' | 'narrator' | 'assistant';

export type PauseHint = 'short' | 'medium' | 'long';

export type SupportedLanguage = 'en' | 'hi' | 'hinglish';

export interface VoiceExpression {
  /** Emotional tone. SPEC ONLY on Kokoro — real effect on future GPU model. */
  emotion?: VoiceEmotion;
  /** Speaking style. SPEC ONLY on Kokoro. */
  style?: VoiceStyle;
  /**
   * Intensity 0–100. SPEC ONLY on Kokoro.
   * Maps to emotion intensity for future GPU model.
   */
  intensity?: number;
  /**
   * Speaking rate multiplier 0.75–1.25 (preview) or 0.5–2.0 (synthesis).
   * REAL on Kokoro — wired to KPipeline speed= param.
   */
  speakingRate?: number;
  /**
   * Pitch adjustment. SPEC ONLY — not supported by Kokoro.
   * Forwarded to future GPU model as metadata.
   */
  pitch?: number;
  /**
   * Energy/intensity 0–100. SPEC ONLY on Kokoro.
   * Forwarded to future GPU model as metadata.
   */
  energy?: number;
  /**
   * Pause behavior hint. PARTIAL on Kokoro — implemented via
   * punctuation insertion in text (commas, periods).
   */
  pause?: PauseHint;
  /** BCP-47 language tag. REAL on Kokoro — selects appropriate pipeline. */
  language?: SupportedLanguage | string;
}

// ─── Phase 5: Voice Capability System ────────────────────────────────────────

/**
 * Support level for a voice capability.
 * REAL = produces actual audio effect on current engine
 * PARTIAL = limited/approximate support
 * SPEC_ONLY = stored and forwarded, no current audio effect
 * UNSUPPORTED = not available on this voice/engine
 * GPU_REQUIRED = will be available when Phase 6 GPU infrastructure is deployed
 */
export type CapabilityLevel =
  | 'REAL'
  | 'PARTIAL'
  | 'SPEC_ONLY'
  | 'UNSUPPORTED'
  | 'GPU_REQUIRED';

export interface VoiceCapabilityDetail {
  supported: CapabilityLevel;
  description: string;
  range?: { min: number; max: number };
  values?: string[];
}

export interface VoiceCapabilities {
  voiceId: string;
  provider: string;
  model: string;
  /** Only these capabilities produce actual audio effect now */
  realCapabilities: string[];
  capabilities: {
    speed: VoiceCapabilityDetail;
    language: VoiceCapabilityDetail;
    emotion: VoiceCapabilityDetail;
    style: VoiceCapabilityDetail;
    pitch: VoiceCapabilityDetail;
    energy: VoiceCapabilityDetail;
    pause: VoiceCapabilityDetail;
    intensity: VoiceCapabilityDetail;
    streaming: VoiceCapabilityDetail;
    voiceCloning: VoiceCapabilityDetail;
  };
  languages: string[];
  gpuRequiredFor: string[];
  honestSummary: string;
}

// ─── Phase 5: Language-aware preview text ─────────────────────────────────────

export const DEFAULT_PREVIEW_TEXTS: Record<SupportedLanguage, string> = {
  en: 'Hello! I am Zarax. How can I help you today?',
  hi: 'Namaste! Main Zarax hoon. Aapki kaise madad kar sakti hoon?',
  hinglish: 'Namaste! Main Zarax hoon. Bataiye, main aapki kaise help kar sakti hoon?',
};

/**
 * Maps Kokoro lang_code to BCP-47 language tags.
 * Only add entries for genuinely tested combinations.
 */
export const KOKORO_LANGUAGE_MAP: Record<string, string> = {
  en: 'a',   // American English
  'en-US': 'a',
  'en-GB': 'b', // British English
  hi: 'h',   // Hindi
  'hi-IN': 'h',
  hinglish: 'h', // Use Hindi pipeline for Hinglish (best available)
  ja: 'j',   // Japanese
  zh: 'z',   // Chinese
};

