import { Module } from '@nestjs/common';
import { CacheService, createRedisClient } from '@zarax/redis-client';
import { APP_CONFIG, type AppConfigService } from '@zarax/shared-config';

import type { VoiceGatewayEnv } from '../config/env.schema';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (config: AppConfigService<VoiceGatewayEnv>) =>
        createRedisClient({ url: config.get('REDIS_URL') }),
      inject: [APP_CONFIG],
    },
    {
      provide: CacheService,
      useFactory: (redis: ReturnType<typeof createRedisClient>) => new CacheService(redis),
      inject: [REDIS_CLIENT],
    },
  ],
  exports: [REDIS_CLIENT, CacheService],
})
export class RedisModule {}
