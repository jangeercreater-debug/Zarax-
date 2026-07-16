import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { createRedisClient, DistributedRateLimiter } from '@zarax/redis-client';

import { IDEMPOTENCY_REDIS_CLIENT, IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import {
  DEFAULT_RATE_LIMIT_OPTIONS,
  RATE_LIMITER,
  RateLimitGuard,
} from '../rate-limit/rate-limit.guard';
import type { RateLimitOptions } from '../rate-limit/rate-limit.decorator';
import { ResponseTransformInterceptor } from '../response/response-transform.interceptor';

export interface ApiStandardsModuleOptions {
  redisUrl: string;
  defaultRateLimit: RateLimitOptions;
  enableIdempotency?: boolean;
  enableResponseTransform?: boolean;
}

@Module({})
export class ApiStandardsModule {
  static forRoot(options: ApiStandardsModuleOptions): DynamicModule {
    const redis = createRedisClient({ url: options.redisUrl });

    const providers: Provider[] = [
      { provide: RATE_LIMITER, useValue: new DistributedRateLimiter(redis) },
      { provide: DEFAULT_RATE_LIMIT_OPTIONS, useValue: options.defaultRateLimit },
      { provide: APP_GUARD, useClass: RateLimitGuard },
    ];

    if (options.enableIdempotency ?? true) {
      providers.push(
        { provide: IDEMPOTENCY_REDIS_CLIENT, useValue: redis },
        { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
      );
    }

    if (options.enableResponseTransform ?? true) {
      providers.push({ provide: APP_INTERCEPTOR, useClass: ResponseTransformInterceptor });
    }

    return {
      module: ApiStandardsModule,
      global: true,
      providers,
      exports: [RATE_LIMITER],
    };
  }
}
