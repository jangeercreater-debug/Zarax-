import type { HealthIndicatorService } from '@nestjs/terminus';
import type { Redis } from 'ioredis';

export function createRedisHealthIndicator(redis: Redis, healthIndicatorService: HealthIndicatorService) {
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
