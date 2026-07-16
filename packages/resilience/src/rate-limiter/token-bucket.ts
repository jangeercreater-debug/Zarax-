import { RateLimitedError } from '@zarax/shared-errors';

export interface TokenBucketOptions {
  /** Maximum tokens the bucket can hold (burst capacity). */
  capacity: number;
  /** Tokens added per second. */
  refillPerSecond: number;
}

/**
 * Classic token bucket: tokens refill continuously (computed lazily on each
 * acquire/tryAcquire call rather than via a background timer, so an idle limiter
 * costs nothing). One instance per provider — shared across all calls to that
 * provider from this process.
 */
export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefillAt: number;

  constructor(
    private readonly providerName: string,
    private readonly options: TokenBucketOptions,
  ) {
    this.tokens = options.capacity;
    this.lastRefillAt = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefillAt) / 1000;
    const refillAmount = elapsedSeconds * this.options.refillPerSecond;

    if (refillAmount > 0) {
      this.tokens = Math.min(this.options.capacity, this.tokens + refillAmount);
      this.lastRefillAt = now;
    }
  }

  /** Non-blocking — throws RateLimitedError immediately if no token is available. */
  tryAcquire(): void {
    this.refill();
    if (this.tokens < 1) {
      throw new RateLimitedError(`Rate limit exceeded for ${this.providerName}.`);
    }
    this.tokens -= 1;
  }

  /** Blocking — waits (bounded by maxWaitMs) for a token to become available rather
   * than failing immediately. Useful for background/batch work where a short delay is
   * preferable to a hard failure; request-path code should generally use tryAcquire(). */
  async acquire(maxWaitMs = 5000): Promise<void> {
    const deadline = Date.now() + maxWaitMs;

    for (;;) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      if (Date.now() >= deadline) {
        throw new RateLimitedError(`Rate limit exceeded for ${this.providerName} (timed out waiting).`);
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }
}
