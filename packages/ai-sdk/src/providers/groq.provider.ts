import { OpenAiProvider } from './openai.provider';
import type { LLMProviderName } from './llm-provider.interface';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

/**
 * Groq's API is OpenAI-compatible, so this extends OpenAiProvider rather than
 * reimplementing message/tool-call mapping — the only difference is the base URL and
 * vendor label used in error messages. Avoids duplicate logic (see project principle:
 * never duplicate code) for what is, at the wire-protocol level, the same adapter.
 */
export class GroqProvider extends OpenAiProvider {
  public readonly name: LLMProviderName = 'groq';
  protected readonly vendorLabel = 'Groq';

  constructor(apiKey: string) {
    super(apiKey, GROQ_BASE_URL);
  }
}
