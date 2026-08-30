import type { SynthesizeRequest, VoiceCapabilities } from '../dto/voice.types';

/**
 * Phase 1: TTS Provider Adapter Interface
 *
 * This is the ONLY boundary between the Zarax Voice Engine and any
 * specific TTS provider (Cartesia, OpenAI, ElevenLabs, Zarax custom model).
 *
 * The Voice Engine NEVER imports Cartesia/ElevenLabs/OpenAI directly.
 * It only depends on this interface.
 *
 * Phase 2 will implement: OpenSourceTTSAdapter (self-hosted model)
 * Phase 4 will implement: VoiceCloneAdapter
 * Phase 5 adds: capabilities() — honest per-engine capability declaration
 * Phase 7 will implement: ZaraxTTSAdapter (proprietary model)
 *
 * Current Phase 2 implementation: ZaraxTTSAdapter (Kokoro-82M)
 */
export interface TTSAdapter {
  /** Unique adapter identifier e.g. "cartesia", "openai-tts", "zarax" */
  readonly providerId: string;

  /**
   * Synthesize text to audio buffer.
   * Returns raw PCM audio bytes matching DEFAULT_AUDIO_CONTRACT.
   * Throws AppError with voiceErrorCode in details on failure.
   */
  synthesize(request: SynthesizeRequest, providerVoiceId: string): Promise<Buffer>;

  /**
   * Synthesize a short preview clip (max ~10 seconds).
   * Used by Voice Library preview button.
   * May use a shorter/cheaper model if available.
   */
  preview(providerVoiceId: string, sampleText?: string): Promise<Buffer>;

  /**
   * Phase 5: Return honest capability declaration for this adapter.
   * REAL = produces actual audio effect now.
   * SPEC_ONLY = stored + forwarded, no current audio effect.
   * GPU_REQUIRED = available when Phase 6 GPU infrastructure deployed.
   * Never claim REAL for capabilities that don't actually work.
   */
  getCapabilities(providerVoiceId?: string): VoiceCapabilities;

  /**
   * Check whether the underlying provider is reachable and configured.
   * Returns { healthy: true } or { healthy: false, reason: string }.
   */
  healthCheck(): Promise<{ healthy: boolean; reason?: string }>;

  /**
   * Whether this adapter is available in the current environment.
   * Returns false if required env vars are missing.
   */
  isConfigured(): boolean;
}
