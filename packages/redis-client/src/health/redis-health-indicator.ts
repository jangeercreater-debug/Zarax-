import type { Redis } from 'ioredis';

interface HealthIndicatorServiceLike {
  check(key: string): { up(): unknown; down(opts: Record<string, unknown>): unknown };
}

export function createRedisHealthIndicator(redis: Redis, healthIndicatorService: HealthIndicatorServiceLike) {
  return async () => {
    const indicator = healthIndicatorService.check('redis');
    try {
      const pong = await redis.ping();
      if (pong !== 'PONG') throw new Error(`Unexpected PING response: ${pong}`);
      return indicator.up();
    } catch (error) {
      return indicator.down({ message: error instanceof Error ? error.message : 'unknown error' });
    }
  };
}
