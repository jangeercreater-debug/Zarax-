import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextStore {
  correlationId: string;
  tenantId?: string;
  principalId?: string;
}

const storage = new AsyncLocalStorage<RequestContextStore>();

/**
 * Runs `fn` with the given context available to any code executed within it — including
 * across `await` boundaries — via `getRequestContext()`. Call this once per incoming
 * request (from `CorrelationIdMiddleware`) or once per consumed event-bus message.
 */
export function runWithRequestContext<T>(store: RequestContextStore, fn: () => T): T {
  return storage.run(store, fn);
}

export function getRequestContext(): RequestContextStore | undefined {
  return storage.getStore();
}

export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

export function getTenantId(): string | undefined {
  return storage.getStore()?.tenantId;
}

/** Called by auth guards once a Principal is resolved, to enrich the already-open context. */
export function setRequestPrincipal(tenantId: string, principalId: string): void {
  const store = storage.getStore();
  if (store) {
    store.tenantId = tenantId;
    store.principalId = principalId;
  }
}
