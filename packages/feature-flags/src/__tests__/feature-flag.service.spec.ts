import { asTenantId } from '@zarax/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FeatureFlagService } from '../feature-flag.service';

function buildFakePrisma() {
  return {
    featureFlag: { findUnique: vi.fn(), upsert: vi.fn() },
    featureFlagOverride: { findUnique: vi.fn(), upsert: vi.fn() },
  };
}

function buildFakeCache() {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn(async (_tenantId: unknown, key: string) => (store.has(key) ? store.get(key) : null)),
    set: vi.fn(async (_tenantId: unknown, key: string, value: unknown) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (_tenantId: unknown, key: string) => {
      store.delete(key);
    }),
  };
}

describe('FeatureFlagService', () => {
  const tenantId = asTenantId('tenant-1');
  let prisma: ReturnType<typeof buildFakePrisma>;
  let cache: ReturnType<typeof buildFakeCache>;

  beforeEach(() => {
    prisma = buildFakePrisma();
    cache = buildFakeCache();
  });

  it('returns false for an unknown flag (fail closed)', async () => {
    prisma.featureFlagOverride.findUnique.mockResolvedValue(null);
    prisma.featureFlag.findUnique.mockResolvedValue(null);

    const service = new FeatureFlagService(prisma as never, cache as never);
    expect(await service.isEnabled('nonexistent_flag', tenantId)).toBe(false);
  });

  it('a tenant override takes precedence over the flag default', async () => {
    prisma.featureFlagOverride.findUnique.mockResolvedValue({ enabled: true });
    prisma.featureFlag.findUnique.mockResolvedValue({
      key: 'new_ui',
      description: 'd',
      defaultEnabled: false,
      rolloutPercentage: 0,
    });

    const service = new FeatureFlagService(prisma as never, cache as never);
    expect(await service.isEnabled('new_ui', tenantId)).toBe(true);
  });

  it('returns defaultEnabled when no override exists', async () => {
    prisma.featureFlagOverride.findUnique.mockResolvedValue(null);
    prisma.featureFlag.findUnique.mockResolvedValue({
      key: 'new_ui',
      description: 'd',
      defaultEnabled: true,
      rolloutPercentage: 0,
    });

    const service = new FeatureFlagService(prisma as never, cache as never);
    expect(await service.isEnabled('new_ui', tenantId)).toBe(true);
  });

  it('percentage rollout is deterministic for the same tenant+flag', async () => {
    prisma.featureFlagOverride.findUnique.mockResolvedValue(null);
    prisma.featureFlag.findUnique.mockResolvedValue({
      key: 'gradual_flag',
      description: 'd',
      defaultEnabled: false,
      rolloutPercentage: 50,
    });

    const service1 = new FeatureFlagService(prisma as never, buildFakeCache() as never);
    const service2 = new FeatureFlagService(prisma as never, buildFakeCache() as never);

    const result1 = await service1.isEnabled('gradual_flag', tenantId);
    const result2 = await service2.isEnabled('gradual_flag', tenantId);
    expect(result1).toBe(result2); // same tenant+flag always lands in the same bucket
  });

  it('caches the evaluation result and does not re-query Prisma on the next call', async () => {
    prisma.featureFlagOverride.findUnique.mockResolvedValue(null);
    prisma.featureFlag.findUnique.mockResolvedValue({
      key: 'cached_flag',
      description: 'd',
      defaultEnabled: true,
      rolloutPercentage: 0,
    });

    const service = new FeatureFlagService(prisma as never, cache as never);
    await service.isEnabled('cached_flag', tenantId);
    await service.isEnabled('cached_flag', tenantId);

    expect(prisma.featureFlag.findUnique).toHaveBeenCalledTimes(1);
  });

  it('setOverride invalidates the cache for that tenant+flag', async () => {
    await cache.set(tenantId, 'feature-flag:my_flag', true, 30);
    const service = new FeatureFlagService(prisma as never, cache as never);

    await service.setOverride(tenantId, 'my_flag', false);

    expect(cache.delete).toHaveBeenCalledWith(tenantId, 'feature-flag:my_flag');
  });
});
