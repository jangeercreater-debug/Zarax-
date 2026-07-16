import type { LLMProviderName } from '@zarax/ai-sdk';

/**
 * Expected shape of `Agent.config` (a free-form JSON column in @zarax/database's
 * schema) as far as llm-orchestrator is concerned. All fields are optional with
 * sensible defaults — an Agent created before this contract existed (or via a
 * minimal API call) still works.
 */
export interface AgentRuntimeConfig {
  systemPrompt?: string;
  provider?: LLMProviderName;
  /** Tried in order if `provider` fails — powers AiProviderRegistry.completeWithFallback. */
  fallbackProviders?: LLMProviderName[];
  model?: string;
  enabledTools?: string[];
  ragEnabled?: boolean;
  /** Safety valve against a pathological tool-call loop. */
  maxToolIterations?: number;
  /** Arbitrary per-tool configuration (e.g. webhooks.notification for
   * send_webhook_notification) — passed through to tool-executor untouched. */
  webhooks?: Record<string, string>;
}

export const AGENT_RUNTIME_CONFIG_DEFAULTS: Required<
  Pick<AgentRuntimeConfig, 'provider' | 'model' | 'ragEnabled' | 'maxToolIterations'>
> = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-5',
  ragEnabled: false,
  maxToolIterations: 5,
};

export function resolveAgentRuntimeConfig(raw: Record<string, unknown>): AgentRuntimeConfig {
  return raw as AgentRuntimeConfig; // Validated field-by-field with defaults where each is read — see orchestrator.
}
