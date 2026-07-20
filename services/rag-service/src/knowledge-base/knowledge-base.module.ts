import { Module } from '@nestjs/common';
import { createQdrantClient, VectorStoreService } from '@zarax/qdrant-client';
import { APP_CONFIG, type AppConfigService } from '@zarax/shared-config';

import type { RagServiceEnv } from '../config/env.schema';
import { EmbeddingService } from '../embeddings/embedding.service';
import { UrlExtractorService } from '../extractors/url-extractor';
import { DocumentProcessingService } from '../processing/document-processing.service';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { KnowledgeBaseService } from './knowledge-base.service';
import { VECTOR_STORE } from './tokens';

export { VECTOR_STORE };

@Module({
  controllers: [KnowledgeBaseController],
  providers: [
    EmbeddingService,
    UrlExtractorService,
    DocumentProcessingService,
    KnowledgeBaseService,
    {
      provide: VECTOR_STORE,
      useFactory: (config: AppConfigService<RagServiceEnv>, embeddingService: EmbeddingService) => {
        const client = createQdrantClient({
          url: config.get('QDRANT_URL'),
          apiKey: config.get('QDRANT_API_KEY'),
        });
        return new VectorStoreService(client, embeddingService.getVectorSize());
      },
      inject: [APP_CONFIG, EmbeddingService],
    },
  ],
})
export class KnowledgeBaseModule {}
