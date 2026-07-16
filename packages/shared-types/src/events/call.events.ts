import type { EventEnvelope } from './event-envelope.types';

export interface CallStartedPayload {
  callId: string;
  agentId: string;
  channel: 'voice' | 'web_widget';
  startedAt: string;
}

export interface CallEndedPayload {
  callId: string;
  agentId: string;
  durationMs: number;
  endReason: 'completed' | 'caller_hangup' | 'agent_error' | 'timeout';
}

export type CallStartedEvent = EventEnvelope<'call.started', CallStartedPayload>;
export type CallEndedEvent = EventEnvelope<'call.ended', CallEndedPayload>;
