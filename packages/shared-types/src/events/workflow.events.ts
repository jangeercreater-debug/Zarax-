import type { EventEnvelope } from './event-envelope.types';

export type WorkflowTriggerSource = 'call.ended' | 'schedule' | 'webhook' | 'manual';

export interface WorkflowTriggeredPayload {
  workflowId: string;
  triggerSource: WorkflowTriggerSource;
  context: Record<string, unknown>;
}

export type WorkflowTriggeredEvent = EventEnvelope<'workflow.triggered', WorkflowTriggeredPayload>;

/** Union of every event type flowing through event-bus — extend as new domains are added. */
export type ZaraxEvent =
  | import('./call.events').CallStartedEvent
  | import('./call.events').CallEndedEvent
  | import('./tool.events').ToolExecutionRequestedEvent
  | import('./tool.events').ToolExecutionCompletedEvent
  | WorkflowTriggeredEvent;
