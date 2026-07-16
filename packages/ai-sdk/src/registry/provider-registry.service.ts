import { FallbackChain } from '@zarax/resilience';
import { DependencyUnavailableError } from '@zarax/shared-errors';

import type { LLMProvider, LLMProviderName } from '../providers/llm-provider.interface';
import type { CompletionRequest, CompletionResponse } from '../types/llm.types';

export class AiProviderRegistry {
  private readonly providers = new Map<LLMProviderName, LLMProvider>();

  constructor(private readonly defaultProviderName: LLMProviderName) {}

  register(provider: LLMProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: LLMProviderName): LLMProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new DependencyUnavailableError(
        `LLM provider '${name}' (not configured — missing API key or not registered)`,
      );
    }
    return provider;
  }

  getDefault(): LLMProvider {
    return this.get(this.defaultProviderName);
  }

  has(name: LLMProviderName): boolean {
    return this.providers.has(name);
  }

  /**
   * Tries `providerNames` in order (skipping already-unhealthy ones first, per
   * FallbackChain's ordering), falling back to the next on failure. This is the
   * "automatic fallback when supported" mechanism for LLM calls — e.g.
   * `completeWithFallback(['anthropic', 'groq', 'openai'], request)` tries Claude
   * first, then Groq, then OpenAI, only ever calling as many as needed.
   */
  async completeWithFallback(
    providerNames: LLMProviderName[],
    request: CompletionRequest,
  ): Promise<CompletionResponse> {
    const configured = providerNames.filter((name) => this.has(name));
    if (configured.length === 0) {
      throw new DependencyUnavailableError(
        `None of the requested fallback providers [${providerNames.join(', ')}] are configured.`,
      );
    }

    const chain = new FallbackChain(
      configured.map((name) => {
        const provider = this.get(name);
        return {
          name,
          client: provider.resilientClient,
          call: () => provider.complete(request),
        };
      }),
    );

    return chain.execute();
  }
}
