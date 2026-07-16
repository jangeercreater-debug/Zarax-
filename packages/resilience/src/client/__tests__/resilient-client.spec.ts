import { CircuitOpenError, RateLimitedError, TimeoutError } from '@zarax/shared-errors';
import { describe, expect, it, vi } from 'vitest';

import { ResilientClient } from '../resilient-client';

describe('ResilientClient', () => {
  it('succeeds on the first attempt and records a health success', async () => {
    const client = new ResilientClient({ providerName: 'test', retry: { baseDelayMs: 1 } });
    const result = await client.execute(async () => 'ok');

    expect(result).toBe('ok');
    expect(client.healthMonitor.getSnapshot().successCount).toBe(1);
  });

  it('retries transient failures and eventually succeeds', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('transient')).mockResolvedValue('ok');
    const client = new ResilientClient({
      providerName: 'test',
      retry: { maxAttempts: 3, baseDelayMs: 1 },
    });

    const result = await client.execute(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('opens the circuit after repeated failures and rejects fast afterward', async () => {
    const client = new ResilientClient({
      providerName: 'test',
      retry: { maxAttempts: 1 }, // one attempt per execute() call, no internal retry noise
      circuitBreaker: { failureThreshold: 2 },
    });
    const failingFn = async () => {
      throw new Error('boom');
    };

    await expect(client.execute(failingFn)).rejects.toThrow('boom');
    await expect(client.execute(failingFn)).rejects.toThrow('boom');

    await expect(client.execute(failingFn)).rejects.toThrow(CircuitOpenError);
  });

  it('enforces the configured rate limit', async () => {
    const client = new ResilientClient({
      providerName: 'test',
      retry: { maxAttempts: 1 },
      rateLimiter: { capacity: 1, refillPerSecond: 0 },
    });

    await client.execute(async () => 'ok');
    await expect(client.execute(async () => 'ok')).rejects.toThrow(RateLimitedError);
  });

  it('times out a call that takes too long', async () => {
    const client = new ResilientClient({
      providerName: 'test',
      timeoutMs: 20,
      retry: { maxAttempts: 1 },
    });

    await expect(
      client.execute(() => new Promise((resolve) => setTimeout(() => resolve('too late'), 200))),
    ).rejects.toThrow(TimeoutError);
  });
});
