import type { TenantScoped } from '../tenant/tenant.types';

/**
 * Every event published to event-bus wraps its payload in this envelope. `version`
 * allows a consumer to handle multiple payload shapes for the same `type` during
 * migrations; `correlationId` ties an event back to the originating request/call for
 * tracing across services.
 */
export interface EventEnvelope<TType extends string, TPayload> extends TenantScoped {
  type: TType;
  version: 1;
  eventId: string;
  correlationId: string;
  occurredAt: string; // ISO 8601
  payload: TPayload;
}
