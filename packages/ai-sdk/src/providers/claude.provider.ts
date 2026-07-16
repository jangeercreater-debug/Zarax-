import Anthropic from '@anthropic-ai/sdk';
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

export class ClaudeProvider implements LLMProvider {
  public readonly name = 'anthropic' as const;
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const { system, rest } = splitSystemPrompt(request.messages);

    try {
      const response = await this.client.messages.create({
        model: request.model,
        max_tokens: request.maxTokens ?? 1024,
        temperature: request.temperature,
        system,
        messages: toAnthropicMessages(rest),
        tools: toAnthropicTools(request),
      });

      const toolCalls: ToolCall[] = response.content
        .filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
        .map((block) => ({ id: block.id, name: block.name, arguments: block.input as Record<string, unknown> }));

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
    } catch (error) {
      throw new ExternalServiceError('Claude', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async *streamComplete(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const { system, rest } = splitSystemPrompt(request.messages);

    const stream = this.client.messages.stream({
      model: request.model,
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature,
      system,
      messages: toAnthropicMessages(rest),
      tools: toAnthropicTools(request),
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { type: 'text_delta', text: event.delta.text };
      }
    }

    const final = await stream.finalMessage();
    const toolCalls: ToolCall[] = final.content
      .filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
      .map((block) => ({ id: block.id, name: block.name, arguments: block.input as Record<string, unknown> }));

    for (const toolCall of toolCalls) {
      yield { type: 'tool_call', toolCall };
    }

    yield {
      type: 'done',
      stopReason: STOP_REASON_MAP[final.stop_reason ?? 'end_turn'] ?? 'end_turn',
      usage: { inputTokens: final.usage.input_tokens, outputTokens: final.usage.output_tokens },
    };
  }
}
