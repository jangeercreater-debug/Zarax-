import Anthropic from '@anthropic-ai/sdk';
import { ResilientClient, type ResilienceLogger } from '@zarax/resilience';
import { ExternalServiceError } from '@zarax/shared-errors';

import type { LLMProvider } from './llm-provider.interface';
import type {
  ChatMessage,
  CompletionRequest,
  CompletionResponse,
  StopReason,
  StreamChunk,
  ToolCall,
} from '../types/llm.types';

const STOP_REASON_MAP: Record<string, StopReason> = {
  end_turn: 'end_turn',
  tool_use: 'tool_use',
  max_tokens: 'max_tokens',
  stop_sequence: 'stop_sequence',
};

/** Anthropic takes the system prompt as a top-level field, not as a message in the
 * array — split it out before converting the rest. */
function splitSystemPrompt(messages: ChatMessage[]): {
  system?: string;
  rest: ChatMessage[];
} {
  const systemMessages = messages.filter((m) => m.role === 'system');
  const rest = messages.filter((m) => m.role !== 'system');
  return { system: systemMessages.map((m) => m.content).join('\n\n') || undefined, rest };
}

function toAnthropicMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  return messages.map((message): Anthropic.MessageParam => {
    if (message.role === 'tool') {
      return {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: message.toolCallId ?? '',
            content: message.content,
          },
        ],
      };
    }

    if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0) {
      return {
        role: 'assistant',
        content: message.toolCalls.map((call) => ({
          type: 'tool_use' as const,
          id: call.id,
          name: call.name,
          input: call.arguments,
        })),
      };
    }

    return { role: message.role === 'assistant' ? 'assistant' : 'user', content: message.content };
  });
}

function toAnthropicTools(request: CompletionRequest): Anthropic.Tool[] | undefined {
  if (!request.tools || request.tools.length === 0) return undefined;
  return request.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }));
}

export interface ClaudeProviderOptions {
  apiKey: string;
  logger?: ResilienceLogger;
}

export class ClaudeProvider implements LLMProvider {
  public readonly name = 'anthropic' as const;
  private readonly client: Anthropic;
  /** All outbound calls to Claude go through this — retry/timeout/circuit-breaker/
   * rate-limit/health-monitoring, per the project standard that business logic (and
   * even this adapter's own methods) never call the raw SDK unwrapped. */
  public readonly resilientClient: ResilientClient;

  constructor(options: ClaudeProviderOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey });
    this.resilientClient = new ResilientClient({
      providerName: 'anthropic',
      timeoutMs: 30_000,
      retry: { maxAttempts: 3, baseDelayMs: 500, maxDelayMs: 5000 },
      circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30_000 },
      rateLimiter: { capacity: 50, refillPerSecond: 10 },
      logger: options.logger,
    });
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const { system, rest } = splitSystemPrompt(request.messages);

    return this.resilientClient.execute(async () => {
      let response: Anthropic.Message;
      try {
        response = await this.client.messages.create({
          model: request.model,
          max_tokens: request.maxTokens ?? 1024,
          temperature: request.temperature,
          system,
          messages: toAnthropicMessages(rest),
          tools: toAnthropicTools(request),
        });
      } catch (error) {
        throw new ExternalServiceError(
          'Claude',
          error instanceof Error ? error.message : 'Unknown error',
        );
      }

      const toolCalls: ToolCall[] = response.content
        .filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
        .map((block) => ({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, unknown>,
        }));

      const textContent = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

      return {
        content: textContent,
        toolCalls,
        stopReason: STOP_REASON_MAP[response.stop_reason ?? 'end_turn'] ?? 'end_turn',
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    }, 'Claude.complete');
  }

  /**
   * Streaming is deliberately NOT retried mid-stream (a partially-emitted response
   * can't be safely replayed) — only connection establishment is gated by the circuit
   * breaker, so an already-known-broken provider still fails fast for streaming calls
   * too. Health monitor outcomes are recorded based on whether the stream completes.
   */
  async *streamComplete(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const { system, rest } = splitSystemPrompt(request.messages);

    const stream = await this.resilientClient.circuitBreaker.execute(() =>
      Promise.resolve(
        this.client.messages.stream({
          model: request.model,
          max_tokens: request.maxTokens ?? 1024,
          temperature: request.temperature,
          system,
          messages: toAnthropicMessages(rest),
          tools: toAnthropicTools(request),
        }),
      ),
    );

    try {
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'text_delta', text: event.delta.text };
        }
      }

      const final = await stream.finalMessage();
      const toolCalls: ToolCall[] = final.content
        .filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
        .map((block) => ({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, unknown>,
        }));

      for (const toolCall of toolCalls) {
        yield { type: 'tool_call', toolCall };
      }

      this.resilientClient.healthMonitor.recordSuccess();
      yield {
        type: 'done',
        stopReason: STOP_REASON_MAP[final.stop_reason ?? 'end_turn'] ?? 'end_turn',
        usage: { inputTokens: final.usage.input_tokens, outputTokens: final.usage.output_tokens },
      };
    } catch (error) {
      this.resilientClient.healthMonitor.recordFailure();
      throw new ExternalServiceError(
        'Claude',
        error instanceof Error ? error.message : 'Streaming failed',
      );
    }
  }
}
