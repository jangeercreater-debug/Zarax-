import type { Redis } from 'ioredis';

// Atomic increment + set-expiry-only-on-first-hit, so a window's TTL is set exactly
// once (at the first request in that window) rather than sliding forward on every hit.
const RATE_LIMIT_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
return current
`;

export interface RateLimitResult {
  allowed: boolean;
  /** Requests made so far in the current window, including this one. */
  count: number;
  limit: number;
  /** Milliseconds until the current window resets. */
  resetInMs: number;
}

export interface DistributedRateLimiterOptions {
  /** Max requests allowed per window. */
  limit: number;
  windowMs: number;
}

/**
 * Fixed-window counter — simpler and cheaper than a sliding-window/token-bucket
 * implementation, at the cost of allowing up to 2x `limit` requests across a window
 * boundary in the worst case. That tradeoff is fine for the "protect against abuse and
 * runaway clients" use case this exists for; a stricter algorithm can replace this
 * without touching call sites if ever needed.
 */
export class DistributedRateLimiter {
  constructor(private readonly redis: Redis) {}

  /** `key` should already be fully qualified (e.g. `ratelimit:{tenantId}:{route}`) —
   * this class doesn't impose a naming scheme, callers (e.g. RateLimitGuard) do. */
  async consume(key: string, options: DistributedRateLimiterOptions): Promise<RateLimitResult> {
    const count = (await this.redis.eval(RATE_LIMIT_SCRIPT, 1, key, options.windowMs)) as number;
    const ttlMs = await this.redis.pttl(key);

    return {
      allowed: count <= options.limit,
      count,
      limit: options.limit,
      resetInMs: ttlMs > 0 ? ttlMs : options.windowMs,
    };
  }
}
