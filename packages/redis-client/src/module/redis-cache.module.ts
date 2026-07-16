import { Module, type DynamicModule } from '@nestjs/common';

import { CacheService } from '../cache/cache.service';
import { createRedisClient } from '../redis-client.factory';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
export const REDIS_CACHE = Symbol('REDIS_CACHE');

export interface RedisCacheModuleOptions {
  redisUrl: string;
}

/**
 * Usage — replaces what used to be a local `common/redis.module.ts` per service:
 *   imports: [RedisCacheModule.forRoot({ redisUrl: process.env.REDIS_URL ?? '' })]
 *   // elsewhere: constructor(@Inject(REDIS_CACHE) private cache: CacheService) {}
 */
@Module({})
export class RedisCacheModule {
  static forRoot(options: RedisCacheModuleOptions): DynamicModule {
    return {
      module: RedisCacheModule,
      global: true,
      providers: [
        { provide: REDIS_CLIENT, useValue: createRedisClient({ url: options.redisUrl }) },
        {
          provide: REDIS_CACHE,
          useFactory: (redis: ReturnType<typeof createRedisClient>) => new CacheService(redis),
          inject: [REDIS_CLIENT],
        },
      ],
      exports: [REDIS_CLIENT, REDIS_CACHE],
    };
  }
}
