import { OpenAiProvider, type OpenAiProviderOptions } from './openai.provider';
import type { LLMProviderName } from './llm-provider.interface';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

export type GroqProviderOptions = Omit<OpenAiProviderOptions, 'baseURL' | 'vendorLabel'>;

/**
 * Groq's API is OpenAI-compatible, so this extends OpenAiProvider rather than
 * reimplementing message/tool-call mapping and resilience wiring — the only
 * difference is the base URL and vendor label. Avoids duplicate logic (see project
 * principle: never duplicate code) for what is, at the wire-protocol level, the same
 * adapter.
 *
 * `name` is set after calling super() (subclass field initializers run once super()
 * returns) — this is fine here since `name` is only read afterward, by callers, never
 * during OpenAiProvider's own constructor. `vendorLabel`, by contrast, IS read during
 * the base constructor (to build the resilience client's providerName), which is why
 * it's passed through `options` instead of relying on field-override timing.
 */
export class GroqProvider extends OpenAiProvider {
  public readonly name: LLMProviderName = 'groq';

  constructor(options: GroqProviderOptions) {
    super({ ...options, baseURL: GROQ_BASE_URL, vendorLabel: 'Groq' });
  }
}
