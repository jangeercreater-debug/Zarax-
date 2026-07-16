import { Module } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import {
  ApiKeyRepository,
  createPrismaClient,
  createPrismaHealthIndicator,
  ServiceAccountRepository,
} from '@zarax/database';
import { EventBusModule } from '@zarax/event-bus';
import { createRedisClient, createRedisHealthIndicator } from '@zarax/redis-client';
import { AuthModule, API_KEY_VALIDATOR, SERVICE_ACCOUNT_VALIDATOR } from '@zarax/shared-auth';
import { AppConfigModule } from '@zarax/shared-config';
import { LoggerModule } from '@zarax/shared-logger';
import { HealthModule, MetricsModule } from '@zarax/shared-observability';

import { CallsModule } from './calls/calls.module';
import { DatabaseModule } from './common/database.module';
import { voiceGatewayEnvSchema } from './config/env.schema';
import { LiveKitModule } from './livekit/livekit.module';
import { RoomsModule } from './rooms/rooms.module';
import { WebhooksModule } from './webhooks/webhooks.module';

// See services/api/src/app.module.ts for why these instances are built directly from
// process.env here rather than via DI — the same reasoning applies to every service.
const prisma = createPrismaClient();
const redis = createRedisClient({ url: process.env.REDIS_URL ?? '' });
const healthIndicatorService = new HealthIndicatorService();

@Module({
  imports: [
    AppConfigModule.forRoot({ schema: voiceGatewayEnvSchema }),
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
        createPrismaHealthIndicator(prisma, healthIndicatorService),
        createRedisHealthIndicator(redis, healthIndicatorService),
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
    DatabaseModule,
    LiveKitModule,
    CallsModule,
    RoomsModule,
    WebhooksModule,
  ],
})
export class AppModule {}
