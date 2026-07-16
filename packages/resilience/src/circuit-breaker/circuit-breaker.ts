import { CircuitOpenError } from '@zarax/shared-errors';

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerOptions {
  /** Consecutive failures (while closed) before the circuit opens. */
  failureThreshold?: number;
  /** How long the circuit stays open before allowing one trial call (half-open). */
  resetTimeoutMs?: number;
  /** Consecutive successes required in half-open state before fully closing again. */
  successThresholdToClose?: number;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  totalCalls: number;
  totalFailures: number;
  lastFailureAt?: string;
  lastStateChangeAt: string;
}

const DEFAULTS: Required<CircuitBreakerOptions> = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  successThresholdToClose: 2,
};

/**
 * One instance per provider (not per call) — state must persist across calls to be
 * meaningful. Typically held as a singleton inside a provider adapter or the
 * ResilientClient wrapping it.
 */
export class CircuitBreaker {
  private readonly options: Required<CircuitBreakerOptions>;
  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private totalCalls = 0;
  private totalFailures = 0;
  private lastFailureAt?: Date;
  private lastStateChangeAt = new Date();
  private openedAt?: Date;

  constructor(
    private readonly providerName: string,
    options: CircuitBreakerOptions = {},
  ) {
    this.options = { ...DEFAULTS, ...options };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalCalls++;

    if (this.state === 'open') {
      if (this.canAttemptReset()) {
        this.transitionTo('half_open');
      } else {
        throw new CircuitOpenError(this.providerName);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      totalCalls: this.totalCalls,
      totalFailures: this.totalFailures,
      lastFailureAt: this.lastFailureAt?.toISOString(),
      lastStateChangeAt: this.lastStateChangeAt.toISOString(),
    };
  }

  private canAttemptReset(): boolean {
    if (!this.openedAt) return true;
    return Date.now() - this.openedAt.getTime() >= this.options.resetTimeoutMs;
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0;

    if (this.state === 'half_open') {
      this.consecutiveSuccesses++;
      if (this.consecutiveSuccesses >= this.options.successThresholdToClose) {
        this.transitionTo('closed');
      }
    }
  }

  private onFailure(): void {
    this.totalFailures++;
    this.lastFailureAt = new Date();
    this.consecutiveSuccesses = 0;
    this.consecutiveFailures++;

    if (this.state === 'half_open') {
      // A trial call failed — back to open immediately, don't wait for the full threshold.
      this.transitionTo('open');
      return;
    }

    if (this.state === 'closed' && this.consecutiveFailures >= this.options.failureThreshold) {
      this.transitionTo('open');
    }
  }

  private transitionTo(state: CircuitState): void {
    this.state = state;
    this.lastStateChangeAt = new Date();
    if (state === 'open') this.openedAt = new Date();
    if (state === 'closed') {
      this.consecutiveFailures = 0;
      this.consecutiveSuccesses = 0;
    }
  }
}
