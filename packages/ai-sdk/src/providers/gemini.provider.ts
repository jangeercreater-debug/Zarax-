import { GoogleGenerativeAI, type Content, type Part } from '@google/generative-ai';
import { ResilientClient, type ResilienceLogger } from '@zarax/resilience';
import { ExternalServiceError } from '@zarax/shared-errors';

import type { LLMProvider } from './llm-provider.interface';
import type {
  ChatMessage,
  CompletionRequest,
  CompletionResponse,
  StreamChunk,
  ToolCall,
} from '../types/llm.types';

function splitSystemInstruction(messages: ChatMessage[]): { system?: string; rest: ChatMessage[] } {
  const systemMessages = messages.filter((m) => m.role === 'system');
  const rest = messages.filter((m) => m.role !== 'system');
  return { system: systemMessages.map((m) => m.content).join('\n\n') || undefined, rest };
}

function toGeminiContents(messages: ChatMessage[]): Content[] {
  return messages.map((message): Content => {
    if (message.role === 'tool') {
      return {
        role: 'function',
        parts: [
          {
            functionResponse: {
              name: message.toolCallId ?? 'unknown_tool',
              response: { content: message.content },
            },
          },
        ],
      };
    }

    if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0) {
      const parts: Part[] = message.toolCalls.map((call) => ({
        functionCall: { name: call.name, args: call.arguments },
      }));
      return { role: 'model', parts };
    }

    return {
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    };
  });
}

export interface GeminiProviderOptions {
  apiKey: string;
  logger?: ResilienceLogger;
}

export class GeminiProvider implements LLMProvider {
  public readonly name = 'gemini' as const;
  private readonly client: GoogleGenerativeAI;
  public readonly resilientClient: ResilientClient;

  constructor(options: GeminiProviderOptions) {
    this.client = new GoogleGenerativeAI(options.apiKey);
    this.resilientClient = new ResilientClient({
      providerName: 'gemini',
      timeoutMs: 30_000,
      retry: { maxAttempts: 3, baseDelayMs: 500, maxDelayMs: 5000 },
      circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30_000 },
      rateLimiter: { capacity: 60, refillPerSecond: 15 },
      logger: options.logger,
    });
  }

  private buildModel(request: CompletionRequest, systemInstruction?: string) {
    return this.client.getGenerativeModel({
      model: request.model,
      systemInstruction,
      generationConfig: { maxOutputTokens: request.maxTokens, temperature: request.temperature },
      tools: request.tools?.length
        ? [
            {
              functionDeclarations: request.tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters as never,
              })),
            },
          ]
        : undefined,
    });
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const { system, rest } = splitSystemInstruction(request.messages);

    return this.resilientClient.execute(async () => {
      let response: Awaited<ReturnType<ReturnType<GoogleGenerativeAI['getGenerativeModel']>['generateContent']>>['response'];
      try {
        const model = this.buildModel(request, system);
        const result = await model.generateContent({ contents: toGeminiContents(rest) });
        response = result.response;
      } catch (error) {
        throw new ExternalServiceError(
          'Gemini',
          error instanceof Error ? error.message : 'Unknown error',
        );
      }

      const functionCalls = response.functionCalls() ?? [];
      const toolCalls: ToolCall[] = functionCalls.map((call, index) => ({
        id: `${call.name}_${index}`,
        name: call.name,
        arguments: call.args as Record<string, unknown>,
      }));

      return {
        content: response.text(),
        toolCalls,
        stopReason: toolCalls.length > 0 ? 'tool_use' : 'end_turn',
        usage: {
          inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
        },
      };
    }, 'Gemini.complete');
  }

  /** See ClaudeProvider.streamComplete for why streaming isn't retried mid-stream. */
  async *streamComplete(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const { system, rest } = splitSystemInstruction(request.messages);

    const result = await this.resilientClient.circuitBreaker.execute(() => {
      const model = this.buildModel(request, system);
      return model.generateContentStream({ contents: toGeminiContents(rest) });
    });

    try {
      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) yield { type: 'text_delta', text };
      }

      const final = await result.response;
      const functionCalls = final.functionCalls() ?? [];
      for (const [index, call] of functionCalls.entries()) {
        yield {
          type: 'tool_call',
          toolCall: {
            id: `${call.name}_${index}`,
            name: call.name,
            arguments: call.args as Record<string, unknown>,
          },
        };
      }

      this.resilientClient.healthMonitor.recordSuccess();
      yield {
        type: 'done',
        stopReason: functionCalls.length > 0 ? 'tool_use' : 'end_turn',
        usage: {
          inputTokens: final.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: final.usageMetadata?.candidatesTokenCount ?? 0,
        },
      };
    } catch (error) {
      this.resilientClient.healthMonitor.recordFailure();
      throw new ExternalServiceError(
        'Gemini',
        error instanceof Error ? error.message : 'Streaming failed',
      );
    }
  }
}
