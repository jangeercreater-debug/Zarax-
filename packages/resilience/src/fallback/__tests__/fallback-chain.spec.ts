import { describe, expect, it, vi } from 'vitest';

import { ResilientClient } from '../../client/resilient-client';
import { FallbackChain } from '../fallback-chain';

function buildClient(): ResilientClient {
  return new ResilientClient({ providerName: 'test', retry: { maxAttempts: 1 } });
}

describe('FallbackChain', () => {
  it('returns the first candidate\'s result when it succeeds', async () => {
    const primary = buildClient();
    const secondary = buildClient();

    const chain = new FallbackChain([
      { name: 'primary', client: primary, call: async () => 'primary-result' },
      { name: 'secondary', client: secondary, call: async () => 'secondary-result' },
    ]);

    expect(await chain.execute()).toBe('primary-result');
  });

  it('falls back to the next candidate when the first fails', async () => {
    const primary = buildClient();
    const secondary = buildClient();

    const chain = new FallbackChain([
      {
        name: 'primary',
        client: primary,
        call: async () => {
          throw new Error('primary down');
        },
      },
      { name: 'secondary', client: secondary, call: async () => 'secondary-result' },
    ]);

    expect(await chain.execute()).toBe('secondary-result');
  });

  it('throws when every candidate fails, summarizing all errors', async () => {
    const primary = buildClient();
    const secondary = buildClient();

    const chain = new FallbackChain([
      {
        name: 'primary',
        client: primary,
        call: async () => {
          throw new Error('primary down');
        },
      },
      {
        name: 'secondary',
        client: secondary,
        call: async () => {
          throw new Error('secondary down');
        },
      },
    ]);

    await expect(chain.execute()).rejects.toThrow(/primary down.*secondary down/s);
  });

  it('tries unhealthy candidates last', async () => {
    const unhealthyPrimary = buildClient();
    // Force the health monitor unhealthy by recording enough failures.
    for (let i = 0; i < 10; i++) unhealthyPrimary.healthMonitor.recordFailure();

    const healthySecondary = buildClient();
    const callOrder: string[] = [];

    const chain = new FallbackChain([
      {
        name: 'unhealthy-primary',
        client: unhealthyPrimary,
        call: async () => {
          callOrder.push('unhealthy-primary');
          return 'result';
        },
      },
      {
        name: 'healthy-secondary',
        client: healthySecondary,
        call: async () => {
          callOrder.push('healthy-secondary');
          return 'result';
        },
      },
    ]);

    await chain.execute();
    expect(callOrder[0]).toBe('healthy-secondary');
  });

  it('throws immediately if constructed with zero candidates', () => {
    expect(() => new FallbackChain([])).toThrow(/at least one candidate/);
  });

  it('does not call logger.warn when no failures occur', async () => {
    const logger = { warn: vi.fn() };
    const client = buildClient();
    const chain = new FallbackChain([{ name: 'only', client, call: async () => 'ok' }], logger);

    await chain.execute();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
