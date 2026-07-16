import { getCorrelationId } from '@zarax/shared-logger';

import { ResilientClient, type ResilientClientOptions } from '../client/resilient-client';

export interface ResilientFetchInit extends RequestInit {
  /** Overrides the ambient correlation ID (from AsyncLocalStorage) if provided —
   * useful when making a call on behalf of a different traced context. */
  correlationId?: string;
}

const CORRELATION_HEADER = 'x-request-id';

/**
 * Combines ResilientClient's retry/timeout/circuit-breaker/rate-limit/health-monitor
 * behavior with automatic correlation-ID propagation, for provider adapters built on
 * `fetch` (e.g. Cartesia's REST endpoint). SDK-based adapters (Deepgram, LiveKit,
 * Claude, ...) use ResilientClient directly instead, since they don't go through fetch.
 */
export class ResilientHttpClient {
  private readonly client: ResilientClient;

  constructor(options: ResilientClientOptions) {
    this.client = new ResilientClient(options);
  }

  async fetch(url: string, init: ResilientFetchInit = {}): Promise<Response> {
    const correlationId = init.correlationId ?? getCorrelationId();

    return this.client.execute((signal) => {
      const headers = new Headers(init.headers);
      if (correlationId) headers.set(CORRELATION_HEADER, correlationId);

      return fetch(url, { ...init, headers, signal });
    }, `HTTP ${init.method ?? 'GET'} ${url}`);
  }

  get circuitBreaker(): ResilientClient['circuitBreaker'] {
    return this.client.circuitBreaker;
  }

  get healthMonitor(): ResilientClient['healthMonitor'] {
    return this.client.healthMonitor;
  }
}
