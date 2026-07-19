import { Module } from '@nestjs/common';
import {
  ApiKeyRepository,
  createPrismaClient,
  createPrismaHealthIndicator,
  PrismaClientModule,
  ServiceAccountRepository,
} from '@zarax/database';
import { EventBusModule } from '@zarax/event-bus';
import { createRedisClient, createRedisHealthIndicator } from '@zarax/redis-client';
import { AuthModule, API_KEY_VALIDATOR, SERVICE_ACCOUNT_VALIDATOR } from '@zarax/shared-auth';
import { AppConfigModule } from '@zarax/shared-config';
import { LoggerModule } from '@zarax/shared-logger';
import { HealthModule, MetricsModule } from '@zarax/shared-observability';

import { CallsModule } from './calls/calls.module';
import { voiceGatewayEnvSchema } from './config/env.schema';
import { LiveKitModule } from './livekit/livekit.module';
import { RoomsModule } from './rooms/rooms.module';
import { WebhooksModule } from './webhooks/webhooks.module';

// See services/api/src/app.module.ts for why these instances are built directly from
// process.env here rather than via DI — the same reasoning applies to every service.
const prisma = createPrismaClient({ poolMax: Number(process.env.DATABASE_POOL_MAX ?? 10) });
const redis = createRedisClient({ url: process.env.REDIS_URL ?? '' });
const healthIndicatorService = { check: (key: string) => ({ up: (d?: Record<string, unknown>) => ({ [key]: { status: 'up', ...d } }), down: (d?: Record<string, unknown>) => ({ [key]: { status: 'down', ...d } }) }) } as never;

@Module({
  imports: [
    AppConfigModule.forRoot({ schema: voiceGatewayEnvSchema as never }),
    LoggerModule.forRoot({
      serviceName: 'voice-gateway',
      level: process.env.LOG_LEVEL ?? 'info',
      pretty: process.env.NODE_ENV !== 'production',
    }),
    EventBusModule.forRoot({
      redisUrl: process.env.EVENT_BUS_REDIS_URL ?? process.env.REDIS_URL ?? '',
    }),
    HealthModule.forRoot({
      indicators: [
        createPrismaHealthIndicator(prisma, healthIndicatorService) as never,
        createRedisHealthIndicator(redis, healthIndicatorService) as never,
      ],
    }),
    MetricsModule.forRoot({ serviceName: 'voice-gateway' }),
    AuthModule.forRoot({
      apiKeyValidatorProvider: {
        provide: API_KEY_VALIDATOR,
        useValue: new ApiKeyRepository(prisma),
      },
      serviceAccountValidatorProvider: {
        provide: SERVICE_ACCOUNT_VALIDATOR,
        useValue: new ServiceAccountRepository(prisma),
      },
    }),
    PrismaClientModule.forRoot(),
    LiveKitModule,
    CallsModule,
    RoomsModule,
    WebhooksModule,
  ],
})
export class AppModule {}
