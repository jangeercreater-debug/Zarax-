export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** Set when role === 'tool' — ties the result back to the tool call that requested it. */
  toolCallId?: string;
  /** Set when role === 'assistant' and this message represents tool call(s) rather
   * than a final answer. */
  toolCalls?: ToolCall[];
}

/** JSON-schema-shaped parameter definition — same shape every vendor's function-calling
 * API expects, so tool-executor's tool registry only needs to define this once. */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface CompletionRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
}

export interface CompletionResponse {
  content: string;
  toolCalls: ToolCall[];
  stopReason: StopReason;
  usage: TokenUsage;
}

export type StreamChunk =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; toolCall: ToolCall }
  | { type: 'done'; stopReason: StopReason; usage: TokenUsage };
