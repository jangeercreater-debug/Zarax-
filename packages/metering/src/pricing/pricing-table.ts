/**
 * USD prices, current as of this milestone (Jan 2026 vintage) — providers change
 * pricing over time; this table is a best-effort snapshot; treat it as accounting
 * telemetry (relative cost tracking, budget alerts, tenant billing estimates), not as
 * anyone's authoritative invoice. Update this file when a provider's list pricing
 * changes; nothing else in @zarax/metering should hardcode a price.
 */

export interface LlmModelPricing {
  /** USD per 1,000,000 input tokens. */
  inputPerMillion: number;
  /** USD per 1,000,000 output tokens. */
  outputPerMillion: number;
}

export const LLM_PRICING: Record<string, Record<string, LlmModelPricing>> = {
  anthropic: {
    'claude-sonnet-4-5': { inputPerMillion: 3, outputPerMillion: 15 },
    'claude-haiku-4-5': { inputPerMillion: 0.8, outputPerMillion: 4 },
  },
  openai: {
    'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
    'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  },
  groq: {
    'llama-3.1-70b-versatile': { inputPerMillion: 0.59, outputPerMillion: 0.79 },
  },
  gemini: {
    'gemini-1.5-pro': { inputPerMillion: 1.25, outputPerMillion: 5 },
  },
};

/** USD per minute of audio. */
export const STT_PRICING: Record<string, number> = {
  deepgram: 0.0043 * 60, // Deepgram Nova-2, pay-as-you-go list price is per-second
};

/** USD per 1,000 characters synthesized. */
export const TTS_PRICING: Record<string, number> = {
  cartesia: 0.03,
};

/** USD per 1,000,000 tokens embedded. */
export const EMBEDDING_PRICING: Record<string, number> = {
  'openai:text-embedding-3-small': 0.02,
};

export function calculateLlmCostUsd(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = LLM_PRICING[provider]?.[model];
  if (!pricing) return 0; // Unknown model — cost tracking degrades to $0, never throws.
  return (inputTokens / 1_000_000) * pricing.inputPerMillion + (outputTokens / 1_000_000) * pricing.outputPerMillion;
}

export function calculateSttCostUsd(provider: string, seconds: number): number {
  const perMinute = STT_PRICING[provider];
  if (!perMinute) return 0;
  return (seconds / 60) * perMinute;
}

export function calculateTtsCostUsd(provider: string, characters: number): number {
  const per1000 = TTS_PRICING[provider];
  if (!per1000) return 0;
  return (characters / 1000) * per1000;
}

export function calculateEmbeddingCostUsd(providerModelKey: string, tokens: number): number {
  const perMillion = EMBEDDING_PRICING[providerModelKey];
  if (!perMillion) return 0;
  return (tokens / 1_000_000) * perMillion;
}
