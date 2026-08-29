/**
 * Phase 4: Voice Clone Engine — Types, Error Codes, Constants
 *
 * IMPORTANT: Chatterbox Multilingual V3 (MIT) is the selected cloning model.
 * Synthesis is NOT available until a GPU inference service is deployed (Phase 6).
 * This file defines the complete clone lifecycle including that unavailable state.
 */

// ─── Status ──────────────────────────────────────────────────────────────────

export type VoiceCloneStatus =
  | 'UPLOADING'             // Audio received, not yet validated
  | 'VALIDATING'            // Audio format/duration/size checks running
  | 'PROCESSING'            // Speaker embedding extraction in progress
  | 'PROFILE_READY'         // Embedding extracted — synthesis model not yet available
  | 'SYNTHESIS_UNAVAILABLE' // Explicit state: profile ready but GPU not configured
  | 'SYNTHESIS_READY'       // GPU inference available (Phase 6)
  | 'FAILED'                // Processing failed — see failureReason
  | 'INACTIVE';             // Soft-deleted

// ─── Consent ─────────────────────────────────────────────────────────────────

export const CONSENT_VERSION = 'V1' as const;

/**
 * The exact consent text that must be shown to the user and confirmed.
 * Hash of this text is stored in VoiceCloneConsent.consentHash to verify
 * the user saw the actual statement, not a modified version.
 */
export const CONSENT_STATEMENT_V1 = [
  'I confirm that:',
  '1. This is my own voice. I am not cloning the voice of another person.',
  '2. I have the legal right to create this voice profile.',
  '3. I understand this voice profile will be used within the Zarax platform.',
  '4. I understand I can delete this voice profile at any time.',
  '5. I consent to Zarax processing this audio recording to create a voice profile.',
].join('\n');

// ─── Audio Limits ─────────────────────────────────────────────────────────────

export const AUDIO_LIMITS = {
  /** Maximum audio file size in bytes (5MB) */
  MAX_SIZE_BYTES: 5 * 1024 * 1024,
  /** Minimum audio duration in seconds */
  MIN_DURATION_S: 5,
  /** Maximum audio duration in seconds */
  MAX_DURATION_S: 120,
  /** Accepted MIME types */
  ACCEPTED_MIME_TYPES: ['audio/wav', 'audio/wave', 'audio/x-wav', 'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/mp4', 'audio/m4a'],
  /** Accepted file magic bytes prefixes */
  WAV_MAGIC: Buffer.from([0x52, 0x49, 0x46, 0x46]), // "RIFF"
  MP3_MAGIC_ID3: Buffer.from([0x49, 0x44, 0x33]),   // "ID3"
  MP3_MAGIC_SYNC: Buffer.from([0xff, 0xfb]),         // MP3 sync
  OGG_MAGIC: Buffer.from([0x4f, 0x67, 0x67, 0x53]), // "OggS"
} as const;

// ─── Error Codes ──────────────────────────────────────────────────────────────

export const CLONE_ERROR_CODES = {
  CLONE_CONSENT_REQUIRED: 'CLONE_CONSENT_REQUIRED',
  CLONE_CONSENT_INVALID: 'CLONE_CONSENT_INVALID',
  CLONE_CONSENT_VERSION_MISMATCH: 'CLONE_CONSENT_VERSION_MISMATCH',
  CLONE_CONSENT_SELF_VOICE_REQUIRED: 'CLONE_CONSENT_SELF_VOICE_REQUIRED',
  CLONE_AUDIO_MISSING: 'CLONE_AUDIO_MISSING',
  CLONE_AUDIO_INVALID_FORMAT: 'CLONE_AUDIO_INVALID_FORMAT',
  CLONE_AUDIO_TOO_LARGE: 'CLONE_AUDIO_TOO_LARGE',
  CLONE_AUDIO_TOO_SHORT: 'CLONE_AUDIO_TOO_SHORT',
  CLONE_AUDIO_TOO_LONG: 'CLONE_AUDIO_TOO_LONG',
  CLONE_AUDIO_SILENT: 'CLONE_AUDIO_SILENT',
  CLONE_AUDIO_CORRUPTED: 'CLONE_AUDIO_CORRUPTED',
  CLONE_SYNTHESIS_UNAVAILABLE: 'CLONE_SYNTHESIS_UNAVAILABLE',
  CLONE_PROCESSING_FAILED: 'CLONE_PROCESSING_FAILED',
  CLONE_NOT_FOUND: 'CLONE_NOT_FOUND',
  CLONE_ACCESS_DENIED: 'CLONE_ACCESS_DENIED',
  CLONE_RATE_LIMIT_EXCEEDED: 'CLONE_RATE_LIMIT_EXCEEDED',
  CLONE_DUPLICATE_NAME: 'CLONE_DUPLICATE_NAME',
} as const;

export type CloneErrorCode = (typeof CLONE_ERROR_CODES)[keyof typeof CLONE_ERROR_CODES];

// ─── Model Metadata ───────────────────────────────────────────────────────────

/**
 * Chatterbox Multilingual V3 — selected cloning model.
 * License: MIT — commercial use permitted.
 * GPU: ~8GB VRAM required for inference.
 * Status: Architecture ready, GPU inference pending (Phase 6).
 */
export const CLONING_MODEL_METADATA = {
  model: 'chatterbox-multilingual-v3',
  version: 'v3',
  repository: 'github.com/resemble-ai/chatterbox',
  huggingface: 'ResembleAI/chatterbox',
  license: 'MIT',
  commercialUse: true,
  gpuVramRequiredGB: 8,
  languages: 25,
  watermark: 'PerTh (imperceptible neural watermark)',
  synthesisAvailable: false, // Set to true when GPU service is deployed
  synthesisBlockedReason: 'CLONING_SYNTHESIS_UNAVAILABLE: Railway has no GPU. Phase 6 will add GPU inference service with Chatterbox Multilingual V3.',
} as const;

// ─── Synthesis Status Message ─────────────────────────────────────────────────

export const SYNTHESIS_UNAVAILABLE_MESSAGE =
  'Voice profile is ready, but voice synthesis requires GPU infrastructure ' +
  '(Chatterbox Multilingual V3, ~8GB VRAM). No audio was generated. ' +
  'Synthesis will be available when GPU infrastructure is deployed in Phase 6.';
