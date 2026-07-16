import { describe, expect, it, vi } from 'vitest';

import { DistributedRateLimiter } from '../distributed-rate-limiter';

function buildFakeRedis(counts: number[]) {
  let call = 0;
  return {
    eval: vi.fn(async () => counts[call++] ?? counts[counts.length - 1]),
    pttl: vi.fn(async () => 30_000),
  };
}

describe('DistributedRateLimiter', () => {
  it('allows requests under the limit', async () => {
    const redis = buildFakeRedis([1]);
    const limiter = new DistributedRateLimiter(redis as never);

    const result = await limiter.consume('ratelimit:tenant-1:route', { limit: 5, windowMs: 60_000 });
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(1);
  });

  it('denies requests once the count exceeds the limit', async () => {
    const redis = buildFakeRedis([6]);
    const limiter = new DistributedRateLimiter(redis as never);

    const result = await limiter.consume('ratelimit:tenant-1:route', { limit: 5, windowMs: 60_000 });
    expect(result.allowed).toBe(false);
    expect(result.count).toBe(6);
  });

  it('reports resetInMs from the key TTL', async () => {
    const redis = buildFakeRedis([2]);
    const limiter = new DistributedRateLimiter(redis as never);

    const result = await limiter.consume('ratelimit:tenant-1:route', { limit: 5, windowMs: 60_000 });
    expect(result.resetInMs).toBe(30_000);
  });
});
