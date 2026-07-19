import { Module } from '@nestjs/common';
import { createPrismaClient, createPrismaHealthIndicator, PrismaClientModule } from '@zarax/database';
import { EventBusModule } from '@zarax/event-bus';
import { createRedisClient, createRedisHealthIndicator } from '@zarax/redis-client';
import { AppConfigModule } from '@zarax/shared-config';
import { LoggerModule } from '@zarax/shared-logger';
import { HealthModule, MetricsModule } from '@zarax/shared-observability';

import { toolExecutorEnvSchema } from './config/env.schema';
import { ExecutionModule } from './execution/execution.module';

// See services/api/src/app.module.ts for why these instances are built directly from
// process.env here rather than via DI — the same reasoning applies to every service.
const prisma = createPrismaClient({ poolMax: Number(process.env.DATABASE_POOL_MAX ?? 10) });
const redis = createRedisClient({ url: process.env.REDIS_URL ?? '' });
const healthIndicatorService = { check: (key: string) => ({ up: (d?: Record<string, unknown>) => ({ [key]: { status: 'up', ...d } }), down: (d?: Record<string, unknown>) => ({ [key]: { status: 'down', ...d } }) }) } as never;

@Module({
  imports: [
    AppConfigModule.forRoot({ schema: toolExecutorEnvSchema as never }),
    LoggerModule.forRoot({
      serviceName: 'tool-executor',
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
    MetricsModule.forRoot({ serviceName: 'tool-executor' }),
    PrismaClientModule.forRoot(),
    ExecutionModule,
  ],
})
export class AppModule {}
