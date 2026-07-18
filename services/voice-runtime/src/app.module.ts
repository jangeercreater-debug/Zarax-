import { Module } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { EventBusModule } from '@zarax/event-bus';
import { createPrismaClient, createPrismaHealthIndicator, PrismaClientModule } from '@zarax/database';
import { createRedisClient, createRedisHealthIndicator } from '@zarax/redis-client';
import { AppConfigModule } from '@zarax/shared-config';
import { LoggerModule, ZaraxLogger } from '@zarax/shared-logger';
import { HealthModule, MetricsModule } from '@zarax/shared-observability';

import { voiceRuntimeEnvSchema } from './config/env.schema';
import { RuntimeModule } from './runtime/runtime.module';

const prisma = createPrismaClient({ poolMax: Number(process.env.DATABASE_POOL_MAX ?? 5) });
const redis = createRedisClient({ url: process.env.REDIS_URL ?? '' });
const healthIndicatorService = new HealthIndicatorService();
const logger = new ZaraxLogger({ serviceName: 'voice-runtime', level: process.env.LOG_LEVEL ?? 'info', pretty: process.env.NODE_ENV !== 'production' });

@Module({
  imports: [
    AppConfigModule.forRoot({ schema: voiceRuntimeEnvSchema }),
    LoggerModule.forRoot({ serviceName: 'voice-runtime', level: process.env.LOG_LEVEL ?? 'info', pretty: process.env.NODE_ENV !== 'production' }),
    HealthModule.forRoot({
      indicators: [
        createPrismaHealthIndicator(prisma, healthIndicatorService),
        createRedisHealthIndicator(redis, healthIndicatorService),
      ],
    }),
    MetricsModule.forRoot({ serviceName: 'voice-runtime' }),
    EventBusModule.forRoot({ redisUrl: process.env.EVENT_BUS_REDIS_URL ?? process.env.REDIS_URL ?? '', logger }),
    PrismaClientModule.forRoot(),
    RuntimeModule,
  ],
})
export class AppModule {}
