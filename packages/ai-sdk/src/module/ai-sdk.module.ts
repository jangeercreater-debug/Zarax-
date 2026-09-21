import { Module, type DynamicModule } from '@nestjs/common';
import type { ResilienceLogger } from '@zarax/resilience';

import { ClaudeProvider } from '../providers/claude.provider';
import { GeminiProvider } from '../providers/gemini.provider';
import { GroqProvider } from '../providers/groq.provider';
import type { LLMProviderName } from '../providers/llm-provider.interface';
import { OpenAiProvider } from '../providers/openai.provider';
import { SelfHostedProvider } from '../providers/self-hosted.provider';
import { AiProviderRegistry } from '../registry/provider-registry.service';

export const AI_PROVIDER_REGISTRY = Symbol('AI_PROVIDER_REGISTRY');

export interface AiSdkModuleOptions {
  defaultProvider: LLMProviderName;
  anthropicApiKey?: string;
  groqApiKey?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  /** Internal service token for Zarax's own self-hosted inference server (NOT an
   * external vendor key) — required together with selfHostedBaseUrl to register
   * the 'self-hosted' provider. Either one alone is not enough to register it. */
  selfHostedApiKey?: string;
  /** Base URL of Zarax's own OpenAI-compatible inference server, e.g.
   * https://<modal-app>.modal.run/v1 — see services/zarax-brain-inference. */
  selfHostedBaseUrl?: string;
  /** Passed to every configured provider's ResilientClient for retry/circuit-breaker
   * warning and failure logs. */
  logger?: ResilienceLogger;
}

@Module({})
export class AiSdkModule {
  static forRoot(options: AiSdkModuleOptions): DynamicModule {
    const registry = new AiProviderRegistry(options.defaultProvider);

    if (options.anthropicApiKey) {
      registry.register(new ClaudeProvider({ apiKey: options.anthropicApiKey, logger: options.logger }));
    }
    if (options.groqApiKey) {
      registry.register(new GroqProvider({ apiKey: options.groqApiKey, logger: options.logger }));
    }
    if (options.openaiApiKey) {
      registry.register(new OpenAiProvider({ apiKey: options.openaiApiKey, logger: options.logger }));
    }
    if (options.geminiApiKey) {
      registry.register(new GeminiProvider({ apiKey: options.geminiApiKey, logger: options.logger }));
    }
    if (options.selfHostedApiKey && options.selfHostedBaseUrl) {
      registry.register(
        new SelfHostedProvider({
          apiKey: options.selfHostedApiKey,
          baseURL: options.selfHostedBaseUrl,
          logger: options.logger,
        }),
      );
    }

    return {
      module: AiSdkModule,
      global: true,
      providers: [{ provide: AI_PROVIDER_REGISTRY, useValue: registry }],
      exports: [AI_PROVIDER_REGISTRY],
    };
  }
}
