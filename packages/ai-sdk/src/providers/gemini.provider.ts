import { GoogleGenerativeAI, type Content, type Part } from '@google/generative-ai';
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

export class GeminiProvider implements LLMProvider {
  public readonly name = 'gemini' as const;
  private readonly client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
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
                parameters: tool.parameters,
              })),
            },
          ]
        : undefined,
    });
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const { system, rest } = splitSystemInstruction(request.messages);

    try {
      const model = this.buildModel(request, system);
      const result = await model.generateContent({ contents: toGeminiContents(rest) });
      const response = result.response;

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
    } catch (error) {
      throw new ExternalServiceError('Gemini', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async *streamComplete(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const { system, rest } = splitSystemInstruction(request.messages);
    const model = this.buildModel(request, system);
    const result = await model.generateContentStream({ contents: toGeminiContents(rest) });

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) yield { type: 'text_delta', text };
    }

    const final = await result.response;
    const functionCalls = final.functionCalls() ?? [];
    for (const [index, call] of functionCalls.entries()) {
      yield {
        type: 'tool_call',
        toolCall: { id: `${call.name}_${index}`, name: call.name, arguments: call.args as Record<string, unknown> },
      };
    }

    yield {
      type: 'done',
      stopReason: functionCalls.length > 0 ? 'tool_use' : 'end_turn',
      usage: {
        inputTokens: final.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: final.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  }
}
