/**
 * Phase 4: Voice Clone Engine — Types, Error Codes, Constants
 * Phase 6: Updated — Modal GPU deployed, synthesis NOW AVAILABLE
 *
 * Model: Chatterbox Multilingual V3 (ResembleAI/chatterbox, MIT license)
 * GPU: Modal T4 — ACTIVE ✅
 */

// ─── Status ──────────────────────────────────────────────────────────────────

export type VoiceCloneStatus =
  | 'UPLOADING'
  | 'VALIDATING'
  | 'PROCESSING'
  | 'PROFILE_READY'
  | 'SYNTHESIS_UNAVAILABLE'
  | 'SYNTHESIS_READY'
  | 'FAILED'
  | 'INACTIVE';

// ─── Consent ─────────────────────────────────────────────────────────────────

export const CONSENT_VERSION = 'V1' as const;

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
  MAX_SIZE_BYTES: 5 * 1024 * 1024,
  MIN_DURATION_S: 5,
  MAX_DURATION_S: 120,
  ACCEPTED_MIME_TYPES: ['audio/wav', 'audio/wave', 'audio/x-wav', 'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/mp4', 'audio/m4a'],
  WAV_MAGIC: Buffer.from([0x52, 0x49, 0x46, 0x46]),
  MP3_MAGIC_ID3: Buffer.from([0x49, 0x44, 0x33]),
  MP3_MAGIC_SYNC: Buffer.from([0xff, 0xfb]),
  OGG_MAGIC: Buffer.from([0x4f, 0x67, 0x67, 0x53]),
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
 * Phase 6: Modal GPU deployed ✅
 * Chatterbox Multilingual V3 — MIT license — commercial use permitted.
 * GPU: Modal T4 (16GB VRAM >> 2-3GB needed)
 * Synthesis: ACTIVE
 */
export const CLONING_MODEL_METADATA = {
  model: 'chatterbox-multilingual-v3',
  version: 'v3',
  repository: 'github.com/resemble-ai/chatterbox',
  huggingface: 'ResembleAI/chatterbox',
  license: 'MIT',
  commercialUse: true,
  gpuVramRequiredGB: 3,
  languages: 25,
  watermark: 'PerTh (imperceptible neural watermark)',
  synthesisAvailable: true, // Phase 6: Modal GPU deployed ✅
  synthesisBlockedReason: 'GPU service active — Chatterbox Multilingual V3 on Modal T4.',
} as const;

// ─── Synthesis Status Message ─────────────────────────────────────────────────

export const SYNTHESIS_UNAVAILABLE_MESSAGE =
  'Voice profile is ready, but voice synthesis requires GPU infrastructure ' +
  '(Chatterbox Multilingual V3, ~3GB VRAM). No audio was generated. ' +
  'Synthesis will be available when GPU infrastructure is deployed in Phase 6.';
