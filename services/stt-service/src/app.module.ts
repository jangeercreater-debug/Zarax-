import { Module } from '@nestjs/common';
import { AppConfigModule } from '@zarax/shared-config';
import { LoggerModule } from '@zarax/shared-logger';
import { HealthModule, MetricsModule } from '@zarax/shared-observability';

import { sttServiceEnvSchema } from './config/env.schema';
import { createDeepgramHealthIndicator } from './health/deepgram-health-indicator';
import { TranscriptionModule } from './transcription/transcription.module';

const healthIndicatorService = { check: (key: string) => ({ up: (d?: Record<string, unknown>) => ({ [key]: { status: 'up', ...d } }), down: (d?: Record<string, unknown>) => ({ [key]: { status: 'down', ...d } }) }) } as never;

@Module({
  imports: [
    AppConfigModule.forRoot({ schema: sttServiceEnvSchema as never }),
    LoggerModule.forRoot({
      serviceName: 'stt-service',
      level: process.env.LOG_LEVEL ?? 'info',
      pretty: process.env.NODE_ENV !== 'production',
    }),
    HealthModule.forRoot({
      indicators: [createDeepgramHealthIndicator(process.env.DEEPGRAM_API_KEY, healthIndicatorService)],
    }),
    MetricsModule.forRoot({ serviceName: 'stt-service' }),
    TranscriptionModule,
  ],
})
export class AppModule {}
