import { DependencyUnavailableError } from '@zarax/shared-errors';

import type { LLMProvider, LLMProviderName } from '../providers/llm-provider.interface';

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
}
