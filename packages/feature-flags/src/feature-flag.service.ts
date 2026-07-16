import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { FeatureFlagRepository, PRISMA_CLIENT, type PrismaClient } from '@zarax/database';
import { CacheService, REDIS_CACHE } from '@zarax/redis-client';
import type { TenantId } from '@zarax/shared-types';

const CACHE_TTL_SECONDS = 30; // short — a flag change should propagate quickly, not instantly
const CACHE_KEY_PREFIX = 'feature-flag:';

/** Maps `input` deterministically to an integer in [0, 99] — the same input always
 * produces the same bucket, so a given tenant's rollout membership for a given flag
 * never flips between evaluations (unlike Math.random()). */
function hashToBucket(input: string): number {
  const hash = createHash('sha256').update(input).digest();
  return hash.readUInt32BE(0) % 100;
}

@Injectable()
export class FeatureFlagService {
  private readonly repository: FeatureFlagRepository;

  constructor(
    @Inject(PRISMA_CLIENT) prisma: PrismaClient,
    @Inject(REDIS_CACHE) private readonly cache: CacheService,
  ) {
    this.repository = new FeatureFlagRepository(prisma);
  }

  async isEnabled(key: string, tenantId: TenantId): Promise<boolean> {
    const cached = await this.cache.get<boolean>(tenantId, CACHE_KEY_PREFIX + key).catch(() => null);
    if (cached !== null) return cached;

    const result = await this.evaluate(key, tenantId);
    await this.cache.set(tenantId, CACHE_KEY_PREFIX + key, result, CACHE_TTL_SECONDS).catch(() => undefined);
    return result;
  }

  private async evaluate(key: string, tenantId: TenantId): Promise<boolean> {
    const override = await this.repository.findOverride(tenantId, key);
    if (override) return override.enabled;

    const flag = await this.repository.findByKey(key);
    if (!flag) return false; // Unknown flag — fail closed, not open.
    if (flag.defaultEnabled) return true;
    if (flag.rolloutPercentage <= 0) return false;
    if (flag.rolloutPercentage >= 100) return true;

    return hashToBucket(`${key}:${tenantId}`) < flag.rolloutPercentage;
  }

  /** Admin-facing operations — defining flags and setting overrides. */
  async defineFlag(params: {
    key: string;
    description: string;
    defaultEnabled?: boolean;
    rolloutPercentage?: number;
  }): Promise<void> {
    await this.repository.upsertFlag(params);
  }

  async setOverride(tenantId: TenantId, key: string, enabled: boolean): Promise<void> {
    await this.repository.setOverride(tenantId, key, enabled);
    await this.cache.delete(tenantId, CACHE_KEY_PREFIX + key).catch(() => undefined);
  }
}
