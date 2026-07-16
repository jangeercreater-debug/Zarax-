import { Module } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { AppConfigModule } from '@zarax/shared-config';
import { LoggerModule } from '@zarax/shared-logger';
import { HealthModule, MetricsModule } from '@zarax/shared-observability';

import { ttsServiceEnvSchema } from './config/env.schema';
import { createCartesiaHealthIndicator } from './health/cartesia-health-indicator';
import { SynthesisModule } from './synthesis/synthesis.module';

const healthIndicatorService = new HealthIndicatorService();

@Module({
  imports: [
    AppConfigModule.forRoot({ schema: ttsServiceEnvSchema }),
    LoggerModule.forRoot({
      serviceName: 'tts-service',
      level: process.env.LOG_LEVEL ?? 'info',
      pretty: process.env.NODE_ENV !== 'production',
    }),
    HealthModule.forRoot({
      indicators: [createCartesiaHealthIndicator(process.env.CARTESIA_API_KEY, healthIndicatorService)],
    }),
    MetricsModule.forRoot({ serviceName: 'tts-service' }),
    SynthesisModule,
  ],
})
export class AppModule {}
