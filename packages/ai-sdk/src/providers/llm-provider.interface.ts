import type { CompletionRequest, CompletionResponse, StreamChunk } from '../types/llm.types';

export type LLMProviderName = 'anthropic' | 'groq' | 'openai' | 'gemini';

export interface LLMProvider {
  readonly name: LLMProviderName;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  streamComplete(request: CompletionRequest): AsyncIterable<StreamChunk>;
}
