import { Module } from '@nestjs/common';
import { INTERNAL_SERVICE_TOKEN } from '@zarax/shared-auth';

import { EmbeddingService } from './embedding.service';
import { InternalEmbeddingsController } from './internal-embeddings.controller';

@Module({
  controllers: [InternalEmbeddingsController],
  providers: [
    EmbeddingService,
    {
      provide: INTERNAL_SERVICE_TOKEN,
      useFactory: () => process.env.INTERNAL_SERVICE_TOKEN ?? '',
    },
  ],
})
export class EmbeddingsModule {}
