import { Module } from '@nestjs/common';
import { INTERNAL_SERVICE_TOKEN } from '@zarax/shared-auth';
import { APP_CONFIG, type AppConfigService } from '@zarax/shared-config';

import type { SttServiceEnv } from '../config/env.schema';
import { DeepgramBatchService } from '../deepgram/deepgram-batch.service';
import { TranscriptionController } from './transcription.controller';
import { TranscriptionGatewayService } from './transcription-gateway.service';

@Module({
  controllers: [TranscriptionController],
  providers: [
    TranscriptionGatewayService,
    DeepgramBatchService,
    {
      provide: INTERNAL_SERVICE_TOKEN,
      useFactory: (config: AppConfigService<SttServiceEnv>) => config.get('INTERNAL_SERVICE_TOKEN'),
      inject: [APP_CONFIG],
    },
  ],
  exports: [TranscriptionGatewayService],
})
export class TranscriptionModule {}
