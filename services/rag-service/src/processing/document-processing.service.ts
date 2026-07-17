import { randomUUID } from 'node:crypto';

import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { JobQueue } from '@zarax/job-queue';
import { KnowledgeBaseDocumentRepository, PRISMA_CLIENT, type PrismaClient } from '@zarax/database';
import { VectorStoreService } from '@zarax/qdrant-client';
import { ZARAX_LOGGER, type ZaraxLogger } from '@zarax/shared-logger';
import { asTenantId } from '@zarax/shared-types';
import type { Job } from 'bullmq';

import { chunkText } from '../chunking/text-chunker';
import { EmbeddingService } from '../embeddings/embedding.service';
import { VECTOR_STORE } from '../knowledge-base/knowledge-base.module';

interface ProcessDocumentJobData {
  documentId: string;
  tenantId: string;
}

interface ChunkPayload {
  text: string;
  documentId: string;
  chunkIndex: number;
  [key: string]: unknown;
}

@Injectable()
export class DocumentProcessingService implements OnModuleDestroy {
  private readonly queue: JobQueue<ProcessDocumentJobData>;
  private readonly documentRepository: KnowledgeBaseDocumentRepository;

  constructor(
    private readonly embeddingService: EmbeddingService,
    @Inject(VECTOR_STORE) private readonly vectorStore: VectorStoreService,
    @Inject(PRISMA_CLIENT) prisma: PrismaClient,
    @Inject(ZARAX_LOGGER) logger: ZaraxLogger,
  ) {
    this.documentRepository = new KnowledgeBaseDocumentRepository(prisma);

    this.queue = new JobQueue<ProcessDocumentJobData>({
      name: 'knowledge-base-processing',
      redisUrl: process.env.REDIS_URL ?? '',
      attempts: 3,
      backoffDelayMs: 5000,
      logger,
      onDeadLetter: async (data) => {
        await this.documentRepository
          .markFailed(
            data.originalData.documentId,
            `Processing failed after ${data.attemptsMade} attempts: ${data.failureReason}`,
          )
          .catch(() => undefined); // the document may have been deleted mid-processing — nothing to mark
      },
    });

    this.queue.process((job: Job<ProcessDocumentJobData>) => this.processDocument(job.data));
  }

  async enqueue(documentId: string, tenantId: string): Promise<void> {
    await this.queue.add('process', { documentId, tenantId });
  }

  private async processDocument(data: ProcessDocumentJobData): Promise<void> {
    const tenantId = asTenantId(data.tenantId);
    const doc = await this.documentRepository.findByIdForTenantOrThrow(tenantId, data.documentId);
    await this.documentRepository.markProcessing(doc.id);

    if (!doc.extractedText) {
      // Not a transient failure — retrying won't help, so fail fast instead of
      // burning BullMQ's retry budget for nothing.
      await this.documentRepository.markFailed(doc.id, 'No extracted text available.');
      return;
    }

    // Clears any stale chunks from a previous run — makes re-index (and a mid-flight
    // retry after a partial upsert) safe to re-run without duplicate/orphaned chunks.
    await this.vectorStore.deleteByDocumentId(tenantId, 'knowledge_base', doc.id);

    const chunks = chunkText(doc.extractedText);
    if (chunks.length === 0) {
      await this.documentRepository.markCompleted(doc.id, 0);
      return;
    }

    // Embedding/upsert errors propagate deliberately — BullMQ retries per its
    // configured backoff; only onDeadLetter (every retry exhausted) marks 'failed'.
    const embeddings = await this.embeddingService.embedBatch(chunks);
    const points = chunks.map((chunk, index) => ({
      id: randomUUID(),
      vector: embeddings[index],
      payload: { text: chunk, documentId: doc.id, chunkIndex: index } satisfies ChunkPayload,
    }));

    await this.vectorStore.upsert(tenantId, 'knowledge_base', points);
    await this.documentRepository.markCompleted(doc.id, chunks.length);
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
