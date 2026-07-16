import { Module, type DynamicModule } from '@nestjs/common';

import { ClaudeProvider } from '../providers/claude.provider';
import { GeminiProvider } from '../providers/gemini.provider';
import { GroqProvider } from '../providers/groq.provider';
import type { LLMProviderName } from '../providers/llm-provider.interface';
import { OpenAiProvider } from '../providers/openai.provider';
import { AiProviderRegistry } from '../registry/provider-registry.service';

export const AI_PROVIDER_REGISTRY = Symbol('AI_PROVIDER_REGISTRY');

export interface AiSdkModuleOptions {
  defaultProvider: LLMProviderName;
  anthropicApiKey?: string;
  groqApiKey?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
}

@Module({})
export class AiSdkModule {
  static forRoot(options: AiSdkModuleOptions): DynamicModule {
    const registry = new AiProviderRegistry(options.defaultProvider);

    if (options.anthropicApiKey) registry.register(new ClaudeProvider(options.anthropicApiKey));
    if (options.groqApiKey) registry.register(new GroqProvider(options.groqApiKey));
    if (options.openaiApiKey) registry.register(new OpenAiProvider(options.openaiApiKey));
    if (options.geminiApiKey) registry.register(new GeminiProvider(options.geminiApiKey));

    return {
      module: AiSdkModule,
      global: true,
      providers: [{ provide: AI_PROVIDER_REGISTRY, useValue: registry }],
      exports: [AI_PROVIDER_REGISTRY],
    };
  }
}
