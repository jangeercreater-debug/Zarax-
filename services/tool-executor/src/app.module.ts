import { Module } from '@nestjs/common';
import { PrismaClientModule } from '@zarax/database';
import { EventBusModule } from '@zarax/event-bus';
import { AppConfigModule } from '@zarax/shared-config';
import { LoggerModule } from '@zarax/shared-logger';
import { HealthModule, MetricsModule } from '@zarax/shared-observability';

import { toolExecutorEnvSchema } from './config/env.schema';
import { ExecutionModule } from './execution/execution.module';

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
      indicators: [],
    }),
    MetricsModule.forRoot({ serviceName: 'tool-executor' }),
    PrismaClientModule.forRoot(),
    ExecutionModule,
  ],
})
export class AppModule {}
