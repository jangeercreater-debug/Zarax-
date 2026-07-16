import { Module } from '@nestjs/common';
import { CacheService, createRedisClient } from '@zarax/redis-client';
import { APP_CONFIG, type AppConfigService } from '@zarax/shared-config';

import type { LlmOrchestratorEnv } from '../config/env.schema';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
export const REDIS_CACHE = Symbol('REDIS_CACHE');

@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (config: AppConfigService<LlmOrchestratorEnv>) =>
        createRedisClient({ url: config.get('REDIS_URL') }),
      inject: [APP_CONFIG],
    },
    {
      provide: REDIS_CACHE,
      useFactory: (redis: ReturnType<typeof createRedisClient>) => new CacheService(redis),
      inject: [REDIS_CLIENT],
    },
  ],
  exports: [REDIS_CLIENT, REDIS_CACHE],
})
export class RedisModule {}
