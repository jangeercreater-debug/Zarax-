import type { EventEnvelope } from './event-envelope.types';

export interface ToolExecutionRequestedPayload {
  requestId: string;
  callId: string;
  toolName: string;
  /** Arguments as decided by the LLM's function-calling output — validated by tool-executor
   * against the tool's own schema before execution, never trusted as-is. */
  arguments: Record<string, unknown>;
}

export interface ToolExecutionCompletedPayload {
  requestId: string;
  callId: string;
  toolName: string;
  status: 'success' | 'failure';
  result?: Record<string, unknown>;
  errorMessage?: string;
  durationMs: number;
}

export type ToolExecutionRequestedEvent = EventEnvelope<
  'tool.execution_requested',
  ToolExecutionRequestedPayload
>;
export type ToolExecutionCompletedEvent = EventEnvelope<
  'tool.execution_completed',
  ToolExecutionCompletedPayload
>;
