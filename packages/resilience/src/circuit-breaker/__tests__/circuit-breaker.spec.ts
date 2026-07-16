import { CircuitOpenError } from '@zarax/shared-errors';
import { describe, expect, it, vi } from 'vitest';

import { CircuitBreaker } from '../circuit-breaker';

describe('CircuitBreaker', () => {
  it('starts closed and allows calls through', async () => {
    const breaker = new CircuitBreaker('test-provider');
    const result = await breaker.execute(async () => 'ok');
    expect(result).toBe('ok');
    expect(breaker.getState()).toBe('closed');
  });

  it('opens after the failure threshold is reached', async () => {
    const breaker = new CircuitBreaker('test-provider', { failureThreshold: 3 });
    const failingFn = async () => {
      throw new Error('boom');
    };

    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failingFn)).rejects.toThrow('boom');
    }
    expect(breaker.getState()).toBe('open');
  });

  it('rejects immediately with CircuitOpenError while open, without calling fn', async () => {
    const breaker = new CircuitBreaker('test-provider', { failureThreshold: 1 });
    const fn = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(breaker.execute(fn)).rejects.toThrow('boom'); // opens the circuit
    fn.mockClear();

    await expect(breaker.execute(fn)).rejects.toThrow(CircuitOpenError);
    expect(fn).not.toHaveBeenCalled();
  });

  it('transitions to half-open after the reset timeout and closes on enough successes', async () => {
    const breaker = new CircuitBreaker('test-provider', {
      failureThreshold: 1,
      resetTimeoutMs: 10,
      successThresholdToClose: 2,
    });

    await expect(
      breaker.execute(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(breaker.getState()).toBe('open');

    await new Promise((resolve) => setTimeout(resolve, 15));

    await breaker.execute(async () => 'ok'); // 1st half-open success
    expect(breaker.getState()).toBe('half_open');

    await breaker.execute(async () => 'ok'); // 2nd half-open success → closes
    expect(breaker.getState()).toBe('closed');
  });

  it('reopens immediately if the half-open trial call fails', async () => {
    const breaker = new CircuitBreaker('test-provider', { failureThreshold: 1, resetTimeoutMs: 10 });

    await expect(
      breaker.execute(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    await new Promise((resolve) => setTimeout(resolve, 15));

    await expect(
      breaker.execute(async () => {
        throw new Error('still broken');
      }),
    ).rejects.toThrow('still broken');
    expect(breaker.getState()).toBe('open');
  });

  it('reports accurate stats', async () => {
    const breaker = new CircuitBreaker('test-provider');
    await breaker.execute(async () => 'ok');
    await expect(
      breaker.execute(async () => {
        throw new Error('fail');
      }),
    ).rejects.toThrow();

    const stats = breaker.getStats();
    expect(stats.totalCalls).toBe(2);
    expect(stats.totalFailures).toBe(1);
    expect(stats.lastFailureAt).toBeDefined();
  });
});
