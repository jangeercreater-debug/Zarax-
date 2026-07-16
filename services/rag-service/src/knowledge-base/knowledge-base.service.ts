import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { VectorStoreService } from '@zarax/qdrant-client';
import type { TenantId } from '@zarax/shared-types';

import { chunkText } from '../chunking/text-chunker';
import { EmbeddingService } from '../embeddings/embedding.service';
import { VECTOR_STORE } from './knowledge-base.module';
import type {
  IngestDocumentResponseDto,
  SearchKnowledgeBaseResponseDto,
} from './dto/knowledge-base-response.dto';
import type { IngestDocumentDto } from './dto/ingest-document.dto';

interface ChunkPayload {
  text: string;
  documentId: string;
  chunkIndex: number;
  [key: string]: unknown;
}

const DEFAULT_SEARCH_LIMIT = 5;

@Injectable()
export class KnowledgeBaseService {
  constructor(
    private readonly embeddingService: EmbeddingService,
    @Inject(VECTOR_STORE) private readonly vectorStore: VectorStoreService,
  ) {}

  async ingestDocument(tenantId: TenantId, dto: IngestDocumentDto): Promise<IngestDocumentResponseDto> {
    const documentId = randomUUID();
    const chunks = chunkText(dto.text);

    if (chunks.length === 0) {
      return { documentId, chunksIndexed: 0 };
    }

    const embeddings = await this.embeddingService.embedBatch(chunks);

    const points = chunks.map((chunk, index) => ({
      id: randomUUID(),
      vector: embeddings[index],
      payload: {
        text: chunk,
        documentId,
        chunkIndex: index,
        ...dto.metadata,
      } satisfies ChunkPayload,
    }));

    await this.vectorStore.upsert(tenantId, 'knowledge_base', points);

    return { documentId, chunksIndexed: chunks.length };
  }

  async search(
    tenantId: TenantId,
    query: string,
    limit: number = DEFAULT_SEARCH_LIMIT,
  ): Promise<SearchKnowledgeBaseResponseDto> {
    const queryEmbedding = await this.embeddingService.embedOne(query);
    const results = await this.vectorStore.search<ChunkPayload>(
      tenantId,
      'knowledge_base',
      queryEmbedding,
      limit,
    );

    return {
      results: results.map((result) => {
        const { text, documentId: _documentId, chunkIndex: _chunkIndex, ...metadata } = result.payload;
        return { text, score: result.score, metadata };
      }),
    };
  }
}
