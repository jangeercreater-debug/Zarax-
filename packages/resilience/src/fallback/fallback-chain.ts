import { ExternalServiceError } from '@zarax/shared-errors';

import type { ResilientClient } from '../client/resilient-client';

export interface FallbackCandidate<T> {
  name: string;
  /** Given the already-resilient client for this candidate, perform the call. */
  call: (client: ResilientClient) => Promise<T>;
  client: ResilientClient;
}

export interface FallbackChainLogger {
  warn(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Tries each candidate in order. A candidate is skipped without being called at all if
 * its own health monitor currently reports it unhealthy (avoids wasting a request on a
 * provider already known to be struggling) — unless every candidate is unhealthy, in
 * which case it tries them anyway rather than failing outright on a stale health read.
 */
export class FallbackChain<T> {
  constructor(
    private readonly candidates: FallbackCandidate<T>[],
    private readonly logger?: FallbackChainLogger,
  ) {
    if (candidates.length === 0) {
      throw new Error('FallbackChain requires at least one candidate.');
    }
  }

  async execute(): Promise<T> {
    const healthyFirst = [...this.candidates].sort((a, b) => {
      const aHealthy = a.client.healthMonitor.getSnapshot().isHealthy ? 0 : 1;
      const bHealthy = b.client.healthMonitor.getSnapshot().isHealthy ? 0 : 1;
      return aHealthy - bHealthy;
    });

    const errors: Array<{ name: string; error: unknown }> = [];

    for (const candidate of healthyFirst) {
      try {
        return await candidate.call(candidate.client);
      } catch (error) {
        errors.push({ name: candidate.name, error });
        this.logger?.warn(`Fallback candidate '${candidate.name}' failed, trying next`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const summary = errors.map((e) => `${e.name}: ${e.error instanceof Error ? e.error.message : String(e.error)}`).join('; ');
    throw new ExternalServiceError(
      'FallbackChain',
      `All ${this.candidates.length} candidate(s) failed — ${summary}`,
    );
  }
}
