import { Module } from '@nestjs/common';
import { AppConfigModule } from '@zarax/shared-config';
import { LoggerModule } from '@zarax/shared-logger';
import { HealthModule, MetricsModule } from '@zarax/shared-observability';

import { ttsServiceEnvSchema } from './config/env.schema';
import { createCartesiaHealthIndicator } from './health/cartesia-health-indicator';
import { SynthesisModule } from './synthesis/synthesis.module';

const healthIndicatorService = { check: (key: string) => ({ up: (d?: Record<string, unknown>) => ({ [key]: { status: 'up', ...d } }), down: (d?: Record<string, unknown>) => ({ [key]: { status: 'down', ...d } }) }) } as never;

@Module({
  imports: [
    AppConfigModule.forRoot({ schema: ttsServiceEnvSchema as never }),
    LoggerModule.forRoot({
      serviceName: 'tts-service',
      level: process.env.LOG_LEVEL ?? 'info',
      pretty: process.env.NODE_ENV !== 'production',
    }),
    HealthModule.forRoot({
      indicators: [createCartesiaHealthIndicator(process.env.CARTESIA_API_KEY, healthIndicatorService) as never],
    }),
    MetricsModule.forRoot({ serviceName: 'tts-service' }),
    SynthesisModule,
  ],
})
export class AppModule {}
