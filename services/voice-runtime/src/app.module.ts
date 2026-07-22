import { Module } from '@nestjs/common';
import { EventBusModule } from '@zarax/event-bus';
import { PrismaClientModule } from '@zarax/database';
import { AppConfigModule } from '@zarax/shared-config';
import { LoggerModule, ZaraxLogger } from '@zarax/shared-logger';
import { HealthModule, MetricsModule } from '@zarax/shared-observability';

import { voiceRuntimeEnvSchema } from './config/env.schema';
import { RuntimeModule } from './runtime/runtime.module';

const logger = new ZaraxLogger({ serviceName: 'voice-runtime', level: process.env.LOG_LEVEL ?? 'info', pretty: process.env.NODE_ENV !== 'production' });

@Module({
  imports: [
    AppConfigModule.forRoot({ schema: voiceRuntimeEnvSchema as never }),
    LoggerModule.forRoot({ serviceName: 'voice-runtime', level: process.env.LOG_LEVEL ?? 'info', pretty: process.env.NODE_ENV !== 'production' }),
    HealthModule.forRoot({
      indicators: [],
    }),
    MetricsModule.forRoot({ serviceName: 'voice-runtime' }),
    EventBusModule.forRoot({ redisUrl: process.env.EVENT_BUS_REDIS_URL ?? process.env.REDIS_URL ?? '', logger }),
    PrismaClientModule.forRoot(),
    RuntimeModule,
  ],
})
export class AppModule {}
