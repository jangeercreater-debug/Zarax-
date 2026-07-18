import type { LLMProviderName } from '@zarax/ai-sdk';

/**
 * Expected shape of `Agent.config` (a free-form JSON column in @zarax/database's
 * schema) as far as llm-orchestrator is concerned. All fields are optional with
 * sensible defaults — an Agent created before this contract existed (or via a
 * minimal API call) still works.
 */
export interface AgentRuntimeConfig {
  // Note: services/api's AgentConfigDto also has a `description` field — a pure
  // human-facing label for the dashboard's agent list, with no effect on call
  // handling, so it's deliberately not mirrored into this interface.
  systemPrompt?: string;
  /** Played/spoken before the caller's first turn — not used by handleTurn() itself
   * (that's voice-gateway/tts-service's job once the call pipeline plays it), kept
   * here so the config is a complete, single source of truth for an agent's behavior. */
  welcomeMessage?: string;
  provider?: LLMProviderName;
  /** Tried in order if `provider` fails — powers AiProviderRegistry.completeWithFallback. */
  fallbackProviders?: LLMProviderName[];
  model?: string;
  /** Sampling temperature passed through to the provider (0-2). Omitted entirely
   * (not defaulted here) when unset — each provider's own SDK default applies. */
  temperature?: number;
  maxTokens?: number;
  /** Informational framing for the system prompt only — see resolveSystemPrompt();
   * providers have no first-class "response style" parameter to map this onto. */
  responseStyle?: 'concise' | 'balanced' | 'detailed';
  /** Not yet wired into the real-time audio pipeline (voice-gateway/tts-service) —
   * stored here as the single source of truth for when that integration lands. */
  interruptSensitivity?: 'low' | 'medium' | 'high';
  /** Cartesia voice id — consumed by tts-service, not by llm-orchestrator itself. */
  voiceId?: string;
  /** Deepgram STT model — consumed by stt-service, not by llm-orchestrator itself. */
  sttModel?: string;
  enabledTools?: string[];
  ragEnabled?: boolean;
  /** Safety valve against a pathological tool-call loop. */
  maxToolIterations?: number;
  /** Arbitrary per-tool configuration (e.g. webhooks.notification for
   * send_webhook_notification) — passed through to tool-executor untouched. */
  webhooks?: Record<string, string>;
}

export const AGENT_RUNTIME_CONFIG_DEFAULTS: Required<
  Pick<AgentRuntimeConfig, 'provider' | 'fallbackProviders' | 'model' | 'ragEnabled' | 'maxToolIterations'>
> = {
  provider: 'anthropic',
  fallbackProviders: ['openai'], // automatic failover if Claude is unavailable
  model: 'claude-sonnet-4-6',
  ragEnabled: false,
  maxToolIterations: 5,
};

export function resolveAgentRuntimeConfig(raw: Record<string, unknown>): AgentRuntimeConfig {
  return raw as AgentRuntimeConfig; // Validated field-by-field with defaults where each is read — see orchestrator.
}
