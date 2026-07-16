import type { Redis } from 'ioredis';
import type { TenantId } from '@zarax/shared-types';

function namespacedKey(tenantId: TenantId, key: string): string {
  return `tenant:${tenantId}:${key}`;
}

/**
 * All keys are namespaced by tenant, mirroring the tenant_id filter enforced at the
 * database layer by TenantScopedRepository — cache isolation should never be weaker
 * than DB isolation.
 */
export class CacheService {
  constructor(private readonly redis: Redis) {}

  async get<T>(tenantId: TenantId, key: string): Promise<T | null> {
    const raw = await this.redis.get(namespacedKey(tenantId, key));
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async set<T>(tenantId: TenantId, key: string, value: T, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await this.redis.set(namespacedKey(tenantId, key), serialized, 'EX', ttlSeconds);
    } else {
      await this.redis.set(namespacedKey(tenantId, key), serialized);
    }
  }

  async delete(tenantId: TenantId, key: string): Promise<void> {
    await this.redis.del(namespacedKey(tenantId, key));
  }

  /** Deletes every key under a tenant + prefix — e.g. invalidating all cached agent
   * configs for a tenant after a bulk update. Uses SCAN, never KEYS, to avoid blocking
   * the Redis event loop on a large keyspace. */
  async deleteByPrefix(tenantId: TenantId, prefix: string): Promise<number> {
    const pattern = namespacedKey(tenantId, `${prefix}*`);
    let cursor = '0';
    let deleted = 0;

    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        deleted += await this.redis.del(...keys);
      }
    } while (cursor !== '0');

    return deleted;
  }
}
