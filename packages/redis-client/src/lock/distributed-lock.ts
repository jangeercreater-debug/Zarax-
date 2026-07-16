import { randomUUID } from 'node:crypto';

import type { Redis } from 'ioredis';

// Atomic compare-and-delete: only releases the lock if the token still matches,
// so instance A can never accidentally release a lock instance B has since acquired
// (e.g. after A's lock expired and B acquired a new one).
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

export interface AcquiredLock {
  key: string;
  token: string;
  release(): Promise<void>;
}

/**
 * A pragmatic single-node lock — sufficient for "don't run this scheduled workflow
 * twice" style coordination across stateless service instances. Not Redlock-grade
 * (no multi-node quorum); if true multi-node fault tolerance for locking becomes a
 * requirement later, swap this implementation without touching call sites.
 */
export class DistributedLock {
  constructor(private readonly redis: Redis) {}

  async acquire(key: string, ttlMs = 30_000): Promise<AcquiredLock | null> {
    const token = randomUUID();
    const result = await this.redis.set(`lock:${key}`, token, 'PX', ttlMs, 'NX');
    if (result !== 'OK') return null;

    return {
      key,
      token,
      release: async () => {
        await this.redis.eval(RELEASE_SCRIPT, 1, `lock:${key}`, token);
      },
    };
  }

  /** Runs `fn` only if the lock is acquired; releases it afterward regardless of
   * success/failure. Returns null if another instance already holds the lock. */
  async withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T | null> {
    const lock = await this.acquire(key, ttlMs);
    if (!lock) return null;
    try {
      return await fn();
    } finally {
      await lock.release();
    }
  }
}
