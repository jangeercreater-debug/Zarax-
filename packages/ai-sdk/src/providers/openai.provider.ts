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

export class OpenAiProvider implements LLMProvider {
  public readonly name: LLMProviderName = 'openai';
  protected readonly client: OpenAI;
  protected readonly vendorLabel: string = 'OpenAI';

  constructor(apiKey: string, baseURL?: string) {
    this.client = new OpenAI({ apiKey, baseURL });
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: request.model,
        messages: toOpenAiMessages(request.messages),
        tools: toOpenAiTools(request),
        max_tokens: request.maxTokens,
        temperature: request.temperature,
      });

      const choice = response.choices[0];
      if (!choice) {
        throw new Error('Provider returned no completion choices.');
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
    } catch (error) {
      throw new ExternalServiceError(
        this.vendorLabel,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  async *streamComplete(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const stream = await this.client.chat.completions.create({
      model: request.model,
      messages: toOpenAiMessages(request.messages),
      tools: toOpenAiTools(request),
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      stream: true,
      stream_options: { include_usage: true },
    });

    // Tool-call argument fragments arrive across multiple chunks, keyed by index —
    // accumulate them until the stream ends, then emit complete ToolCall objects.
    const toolCallAccumulator = new Map<number, { id: string; name: string; args: string }>();
    let finishReason: StopReason = 'end_turn';
    let usage = { inputTokens: 0, outputTokens: 0 };

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

    yield { type: 'done', stopReason: finishReason, usage };
  }
}
