import { Module, type DynamicModule } from '@nestjs/common';
import { RedisCacheModule } from '@zarax/redis-client';

import { FeatureFlagService } from '../feature-flag.service';

@Module({})
export class FeatureFlagsModule {
  static forRoot(): DynamicModule {
    return {
      module: FeatureFlagsModule,
      global: true,
      imports: [
        RedisCacheModule.forRoot({ redisUrl: process.env.REDIS_URL ?? '' }),
      ],
      providers: [FeatureFlagService],
      exports: [FeatureFlagService],
    };
  }
}
