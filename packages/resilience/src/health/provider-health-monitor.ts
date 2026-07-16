const DEFAULT_WINDOW_SIZE = 20;
const DEFAULT_UNHEALTHY_FAILURE_RATE = 0.5; // ≥50% failures in the window ⇒ unhealthy

export interface ProviderHealthMonitorOptions {
  /** Number of most-recent calls to consider. */
  windowSize?: number;
  /** Failure rate (0-1) within the window at or above which the provider is
   * considered unhealthy. */
  unhealthyFailureRate?: number;
}

export interface ProviderHealthSnapshot {
  isHealthy: boolean;
  windowSize: number;
  successCount: number;
  failureCount: number;
  failureRate: number;
  circuitState?: string;
}

/**
 * Tracks a rolling window of recent call outcomes per provider. Distinct from
 * CircuitBreaker: the breaker makes real-time call/no-call decisions; this monitor is
 * for *observability* (readiness indicator, dashboards) and for FallbackChain to pick
 * a preferred provider — a provider can be "closed" (breaker allowing calls) but still
 * trending unhealthy.
 */
export class ProviderHealthMonitor {
  private readonly windowSize: number;
  private readonly unhealthyFailureRate: number;
  private outcomes: boolean[] = []; // true = success, false = failure

  constructor(
    private readonly providerName: string,
    options: ProviderHealthMonitorOptions = {},
  ) {
    this.windowSize = options.windowSize ?? DEFAULT_WINDOW_SIZE;
    this.unhealthyFailureRate = options.unhealthyFailureRate ?? DEFAULT_UNHEALTHY_FAILURE_RATE;
  }

  recordSuccess(): void {
    this.record(true);
  }

  recordFailure(): void {
    this.record(false);
  }

  private record(outcome: boolean): void {
    this.outcomes.push(outcome);
    if (this.outcomes.length > this.windowSize) {
      this.outcomes = this.outcomes.slice(-this.windowSize);
    }
  }

  getSnapshot(): ProviderHealthSnapshot {
    const successCount = this.outcomes.filter(Boolean).length;
    const failureCount = this.outcomes.length - successCount;
    const failureRate = this.outcomes.length > 0 ? failureCount / this.outcomes.length : 0;

    // Below a minimal sample size, don't declare unhealthy off one or two calls.
    const hasEnoughSamples = this.outcomes.length >= Math.min(5, this.windowSize);

    return {
      isHealthy: !hasEnoughSamples || failureRate < this.unhealthyFailureRate,
      windowSize: this.outcomes.length,
      successCount,
      failureCount,
      failureRate,
    };
  }

  getProviderName(): string {
    return this.providerName;
  }
}
