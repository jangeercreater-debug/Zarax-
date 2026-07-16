import { Module } from '@nestjs/common';
import { INTERNAL_SERVICE_TOKEN } from '@zarax/shared-auth';
import { APP_CONFIG, type AppConfigService } from '@zarax/shared-config';

import { CartesiaRestClient } from '../cartesia/cartesia-rest.client';
import type { TtsServiceEnv } from '../config/env.schema';
import { SynthesisController } from './synthesis.controller';
import { SynthesisGatewayService } from './synthesis-gateway.service';

export const CARTESIA_REST_CLIENT = Symbol('CARTESIA_REST_CLIENT');

@Module({
  controllers: [SynthesisController],
  providers: [
    SynthesisGatewayService,
    {
      provide: CARTESIA_REST_CLIENT,
      useFactory: (config: AppConfigService<TtsServiceEnv>) =>
        new CartesiaRestClient({
          apiKey: config.get('CARTESIA_API_KEY'),
          apiVersion: config.get('CARTESIA_API_VERSION'),
        }),
      inject: [APP_CONFIG],
    },
    {
      provide: INTERNAL_SERVICE_TOKEN,
      useFactory: (config: AppConfigService<TtsServiceEnv>) => config.get('INTERNAL_SERVICE_TOKEN'),
      inject: [APP_CONFIG],
    },
  ],
  exports: [SynthesisGatewayService],
})
export class SynthesisModule {}
