import { getCorrelationId } from '@zarax/shared-logger';
import type { TenantId } from '@zarax/shared-types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Builds a fully-formed event envelope. `correlationId` defaults to whatever request
 * is currently in flight (via shared-logger's AsyncLocalStorage context) so an event
 * published as a side effect of handling a request automatically ties back to it —
 * pass one explicitly when publishing from a non-request context (e.g. a cron job).
 */
export function createEvent<TType extends string, TPayload>(params: {
  type: TType;
  tenantId: TenantId;
  payload: TPayload;
  correlationId?: string;
}): {
  type: TType;
  version: 1;
  eventId: string;
  tenantId: TenantId;
  correlationId: string;
  occurredAt: string;
  payload: TPayload;
} {
  return {
    type: params.type,
    version: 1,
    eventId: uuidv4(),
    tenantId: params.tenantId,
    correlationId: params.correlationId ?? getCorrelationId() ?? uuidv4(),
    occurredAt: new Date().toISOString(),
    payload: params.payload,
  };
}
