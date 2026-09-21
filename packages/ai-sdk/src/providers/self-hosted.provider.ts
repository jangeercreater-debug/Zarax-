import { OpenAiProvider, type OpenAiProviderOptions } from './openai.provider';
import type { LLMProviderName } from './llm-provider.interface';

export type SelfHostedProviderOptions = Omit<OpenAiProviderOptions, 'vendorLabel'> & {
  /** Required (unlike OpenAiProvider, where baseURL is optional and defaults to
   * OpenAI's cloud) — a self-hosted provider has no public default endpoint. */
  baseURL: string;
};

/**
 * Zarax's own-controlled LLM brain — Phase 1 (see docs/r-and-d/phase-7/ Hindi TTS
 * migration work for the parallel self-hosted-voice effort this mirrors).
 *
 * Points at an internal, Zarax-operated inference server exposing an
 * OpenAI-compatible `/v1/chat/completions` endpoint — the same wire protocol vLLM,
 * TGI (text-generation-inference), and Ollama all speak when run in "OpenAI
 * compatibility mode". Extending OpenAiProvider (same pattern GroqProvider uses)
 * means this adapter needs zero new message/tool-call mapping code: the mapping is
 * already correct and already tested against a real OpenAI-wire-protocol server.
 *
 * IMPORTANT — this class does NOT claim to BE a proprietary Zarax model. It is the
 * abstraction boundary: whatever open-source foundation model is deployed behind
 * `baseURL` today (see services/zarax-brain-inference/modal_app.py) can be swapped
 * for a Zarax-trained/fine-tuned model later WITHOUT this class, the registry, or
 * any caller changing — only the Modal service's model-loading code changes.
 *
 * `apiKey` here is Zarax's OWN internal service token (verified by
 * zarax-brain-inference, exactly like ZARAX_CLONE_SERVICE_TOKEN protects the
 * Chatterbox Modal endpoint) — never an external vendor's credential.
 */
export class SelfHostedProvider extends OpenAiProvider {
  public override readonly name: LLMProviderName = 'self-hosted';

  constructor(options: SelfHostedProviderOptions) {
    super({ ...options, vendorLabel: 'ZaraxBrain' });
  }
}
