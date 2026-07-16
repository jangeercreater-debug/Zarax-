import { CircuitBreaker, type CircuitBreakerOptions } from '../circuit-breaker/circuit-breaker';
import { ProviderHealthMonitor, type ProviderHealthMonitorOptions } from '../health/provider-health-monitor';
import { TokenBucketRateLimiter, type TokenBucketOptions } from '../rate-limiter/token-bucket';
import { withRetry, type RetryOptions } from '../retry/retry';
import { withTimeout } from '../timeout/timeout';

export interface ResilienceLogger {
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface ResilientClientOptions {
  providerName: string;
  timeoutMs?: number;
  retry?: RetryOptions;
  circuitBreaker?: CircuitBreakerOptions;
  /** Omit to disable rate limiting for this provider (e.g. an internal call with no
   * meaningful external quota to protect). */
  rateLimiter?: TokenBucketOptions;
  healthMonitor?: ProviderHealthMonitorOptions;
  logger?: ResilienceLogger;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Every provider adapter (Deepgram, Cartesia, LiveKit, Claude, Groq, OpenAI, Gemini)
 * holds one ResilientClient per logical operation type (or one for the whole adapter,
 * if its calls are homogeneous) and routes every outbound call through `.execute()`.
 * Business logic never touches retry/timeout/circuit-breaker/rate-limit concerns
 * directly — it just calls the adapter method, which calls `.execute()` internally.
 */
export class ResilientClient {
  public readonly circuitBreaker: CircuitBreaker;
  public readonly healthMonitor: ProviderHealthMonitor;
  private readonly rateLimiter?: TokenBucketRateLimiter;

  constructor(private readonly options: ResilientClientOptions) {
    this.circuitBreaker = new CircuitBreaker(options.providerName, options.circuitBreaker);
    this.healthMonitor = new ProviderHealthMonitor(options.providerName, options.healthMonitor);
    this.rateLimiter = options.rateLimiter
      ? new TokenBucketRateLimiter(options.providerName, options.rateLimiter)
      : undefined;
  }

  async execute<T>(
    fn: (signal: AbortSignal) => Promise<T>,
    operationName: string = this.options.providerName,
  ): Promise<T> {
    const attemptOnce = (): Promise<T> =>
      withTimeout((signal) => {
        this.rateLimiter?.tryAcquire();
        return fn(signal);
      }, { timeoutMs: this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS, operationName });

    try {
      const result = await this.circuitBreaker.execute(() =>
        withRetry(attemptOnce, {
          ...this.options.retry,
          onRetry: (error, attempt, delayMs) => {
            this.options.logger?.warn(`Retrying ${operationName}`, {
              provider: this.options.providerName,
              attempt,
              delayMs,
              error: error instanceof Error ? error.message : String(error),
            });
            this.options.retry?.onRetry?.(error, attempt, delayMs);
          },
        }),
      );
      this.healthMonitor.recordSuccess();
      return result;
    } catch (error) {
      this.healthMonitor.recordFailure();
      this.options.logger?.error(`${operationName} failed`, {
        provider: this.options.providerName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
