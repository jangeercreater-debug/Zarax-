import type { ResilientClient } from '@zarax/resilience';

import type { CompletionRequest, CompletionResponse, StreamChunk } from '../types/llm.types';

export type LLMProviderName = 'anthropic' | 'groq' | 'openai' | 'gemini';

export interface LLMProvider {
  readonly name: LLMProviderName;
  /** Every provider adapter's outbound calls go through this — exposed so callers can
   * wire its health monitor into a service's /ready indicators, and so FallbackChain
   * (via AiProviderRegistry.completeWithFallback) can order candidates by health. */
  readonly resilientClient: ResilientClient;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  streamComplete(request: CompletionRequest): AsyncIterable<StreamChunk>;
}
