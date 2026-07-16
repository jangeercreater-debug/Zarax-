import { ResilientClient, type ResilienceLogger } from '@zarax/resilience';
import { ExternalServiceError } from '@zarax/shared-errors';
import OpenAI from 'openai';

import type { LLMProvider, LLMProviderName } from './llm-provider.interface';
import type {
  ChatMessage,
  CompletionRequest,
  CompletionResponse,
  StopReason,
  StreamChunk,
  ToolCall,
} from '../types/llm.types';

const FINISH_REASON_MAP: Record<string, StopReason> = {
  stop: 'end_turn',
  tool_calls: 'tool_use',
  length: 'max_tokens',
};

function toOpenAiMessages(messages: ChatMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  return messages.map((message): OpenAI.Chat.ChatCompletionMessageParam => {
    if (message.role === 'tool') {
      return { role: 'tool', tool_call_id: message.toolCallId ?? '', content: message.content };
    }
    if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0) {
      return {
        role: 'assistant',
        content: message.content || null,
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: 'function' as const,
          function: { name: call.name, arguments: JSON.stringify(call.arguments) },
        })),
      };
    }
    return { role: message.role, content: message.content };
  });
}

function toOpenAiTools(request: CompletionRequest): OpenAI.Chat.ChatCompletionTool[] | undefined {
  if (!request.tools || request.tools.length === 0) return undefined;
  return request.tools.map((tool) => ({
    type: 'function' as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
}

function extractToolCalls(
  toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[] | undefined,
): ToolCall[] {
  if (!toolCalls) return [];
  return toolCalls.map((call) => ({
    id: call.id,
    name: call.function.name,
    arguments: JSON.parse(call.function.arguments) as Record<string, unknown>,
  }));
}

export interface OpenAiProviderOptions {
  apiKey: string;
  baseURL?: string;
  /** Label used in error messages and as the resilience provider name — passed
   * explicitly rather than relying on a subclass-overridden field, since subclass
   * field initializers don't run until after this base constructor finishes. */
  vendorLabel?: string;
  logger?: ResilienceLogger;
}

export class OpenAiProvider implements LLMProvider {
  public readonly name: LLMProviderName = 'openai';
  protected readonly client: OpenAI;
  protected readonly vendorLabel: string;
  public readonly resilientClient: ResilientClient;

  constructor(options: OpenAiProviderOptions) {
    this.vendorLabel = options.vendorLabel ?? 'OpenAI';
    this.client = new OpenAI({ apiKey: options.apiKey, baseURL: options.baseURL });
    this.resilientClient = new ResilientClient({
      providerName: this.vendorLabel.toLowerCase(),
      timeoutMs: 30_000,
      retry: { maxAttempts: 3, baseDelayMs: 500, maxDelayMs: 5000 },
      circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30_000 },
      rateLimiter: { capacity: 60, refillPerSecond: 15 },
      logger: options.logger,
    });
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    return this.resilientClient.execute(async () => {
      let response: OpenAI.Chat.ChatCompletion;
      try {
        response = await this.client.chat.completions.create({
          model: request.model,
          messages: toOpenAiMessages(request.messages),
          tools: toOpenAiTools(request),
          max_tokens: request.maxTokens,
          temperature: request.temperature,
        });
      } catch (error) {
        throw new ExternalServiceError(
          this.vendorLabel,
          error instanceof Error ? error.message : 'Unknown error',
        );
      }

      const choice = response.choices[0];
      if (!choice) {
        throw new ExternalServiceError(this.vendorLabel, 'Provider returned no completion choices.');
      }

      return {
        content: choice.message.content ?? '',
        toolCalls: extractToolCalls(choice.message.tool_calls),
        stopReason: FINISH_REASON_MAP[choice.finish_reason] ?? 'end_turn',
        usage: {
          inputTokens: response.usage?.prompt_tokens ?? 0,
          outputTokens: response.usage?.completion_tokens ?? 0,
        },
      };
    }, `${this.vendorLabel}.complete`);
  }

  /** See ClaudeProvider.streamComplete for why streaming isn't retried mid-stream —
   * only connection establishment is circuit-breaker-gated. */
  async *streamComplete(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const stream = await this.resilientClient.circuitBreaker.execute(() =>
      this.client.chat.completions.create({
        model: request.model,
        messages: toOpenAiMessages(request.messages),
        tools: toOpenAiTools(request),
        max_tokens: request.maxTokens,
        temperature: request.temperature,
        stream: true,
        stream_options: { include_usage: true },
      }),
    );

    // Tool-call argument fragments arrive across multiple chunks, keyed by index —
    // accumulate them until the stream ends, then emit complete ToolCall objects.
    const toolCallAccumulator = new Map<number, { id: string; name: string; args: string }>();
    let finishReason: StopReason = 'end_turn';
    let usage = { inputTokens: 0, outputTokens: 0 };

    try {
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          yield { type: 'text_delta', text: delta.content };
        }
        if (delta?.tool_calls) {
          for (const toolCallDelta of delta.tool_calls) {
            const existing = toolCallAccumulator.get(toolCallDelta.index) ?? {
              id: toolCallDelta.id ?? '',
              name: '',
              args: '',
            };
            if (toolCallDelta.function?.name) existing.name = toolCallDelta.function.name;
            if (toolCallDelta.function?.arguments) existing.args += toolCallDelta.function.arguments;
            toolCallAccumulator.set(toolCallDelta.index, existing);
          }
        }
        const rawFinishReason = chunk.choices[0]?.finish_reason;
        if (rawFinishReason) finishReason = FINISH_REASON_MAP[rawFinishReason] ?? 'end_turn';
        if (chunk.usage) {
          usage = {
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
          };
        }
      }

      for (const accumulated of toolCallAccumulator.values()) {
        yield {
          type: 'tool_call',
          toolCall: {
            id: accumulated.id,
            name: accumulated.name,
            arguments: accumulated.args ? (JSON.parse(accumulated.args) as Record<string, unknown>) : {},
          },
        };
      }

      this.resilientClient.healthMonitor.recordSuccess();
      yield { type: 'done', stopReason: finishReason, usage };
    } catch (error) {
      this.resilientClient.healthMonitor.recordFailure();
      throw new ExternalServiceError(
        this.vendorLabel,
        error instanceof Error ? error.message : 'Streaming failed',
      );
    }
  }
}
