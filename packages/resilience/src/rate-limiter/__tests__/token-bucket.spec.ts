import { RateLimitedError } from '@zarax/shared-errors';
import { describe, expect, it } from 'vitest';

import { TokenBucketRateLimiter } from '../token-bucket';

describe('TokenBucketRateLimiter', () => {
  it('allows calls up to capacity, then rejects', () => {
    const limiter = new TokenBucketRateLimiter('test', { capacity: 3, refillPerSecond: 0 });

    limiter.tryAcquire();
    limiter.tryAcquire();
    limiter.tryAcquire();

    expect(() => limiter.tryAcquire()).toThrow(RateLimitedError);
  });

  it('refills tokens over time', async () => {
    const limiter = new TokenBucketRateLimiter('test', { capacity: 1, refillPerSecond: 20 });

    limiter.tryAcquire();
    expect(() => limiter.tryAcquire()).toThrow(RateLimitedError);

    await new Promise((resolve) => setTimeout(resolve, 100)); // ~2 tokens worth at 20/s

    expect(() => limiter.tryAcquire()).not.toThrow();
  });

  it('acquire() waits for a token to become available instead of throwing immediately', async () => {
    const limiter = new TokenBucketRateLimiter('test', { capacity: 1, refillPerSecond: 50 });
    limiter.tryAcquire(); // drain the bucket

    const start = Date.now();
    await limiter.acquire(500);
    expect(Date.now() - start).toBeGreaterThanOrEqual(10);
  });

  it('acquire() throws RateLimitedError if the wait exceeds maxWaitMs', async () => {
    const limiter = new TokenBucketRateLimiter('test', { capacity: 1, refillPerSecond: 0.001 });
    limiter.tryAcquire();

    await expect(limiter.acquire(50)).rejects.toThrow(RateLimitedError);
  });
});
