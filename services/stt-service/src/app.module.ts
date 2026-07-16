import { Module } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { AppConfigModule } from '@zarax/shared-config';
import { LoggerModule } from '@zarax/shared-logger';
import { HealthModule, MetricsModule } from '@zarax/shared-observability';

import { sttServiceEnvSchema } from './config/env.schema';
import { createDeepgramHealthIndicator } from './health/deepgram-health-indicator';
import { TranscriptionModule } from './transcription/transcription.module';

const healthIndicatorService = new HealthIndicatorService();

@Module({
  imports: [
    AppConfigModule.forRoot({ schema: sttServiceEnvSchema }),
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
