import { Module } from '@nestjs/common';

import { EmbeddingService } from './embedding.service';
import { InternalEmbeddingsController } from './internal-embeddings.controller';

@Module({
  controllers: [InternalEmbeddingsController],
  providers: [EmbeddingService],
})
export class EmbeddingsModule {}
