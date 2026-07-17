import { asTenantId } from '@zarax/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let capturedHandler: ((job: { data: { documentId: string; tenantId: string } }) => Promise<void>) | undefined;
let capturedDeadLetterHandler: ((data: { originalData: { documentId: string }; failureReason: string; attemptsMade: number }) => Promise<void>) | undefined;

vi.mock('@zarax/job-queue', () => ({
  JobQueue: vi.fn().mockImplementation((options: { onDeadLetter?: typeof capturedDeadLetterHandler }) => {
    capturedDeadLetterHandler = options.onDeadLetter;
    return {
      add: vi.fn(),
      process: vi.fn((handler: typeof capturedHandler) => {
        capturedHandler = handler;
      }),
      close: vi.fn(),
    };
  }),
}));

import { DocumentProcessingService } from '../document-processing.service';

function buildFakePrisma(initialDoc: Record<string, unknown>) {
  const doc = { ...initialDoc };
  return {
    knowledgeBaseDocument: {
      findFirst: vi.fn(async () => ({ ...doc })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(doc, data);
        return doc;
      }),
    },
  };
}

describe('DocumentProcessingService', () => {
  const tenantId = asTenantId('tenant-1');
  let embeddingService: { embedBatch: ReturnType<typeof vi.fn> };
  let vectorStore: { upsert: ReturnType<typeof vi.fn>; deleteByDocumentId: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    capturedHandler = undefined;
    capturedDeadLetterHandler = undefined;
    embeddingService = { embedBatch: vi.fn() };
    vectorStore = { upsert: vi.fn(), deleteByDocumentId: vi.fn() };
  });

  it('chunks, embeds, and upserts, then marks the document completed', async () => {
    const prisma = buildFakePrisma({
      id: 'doc-1',
      tenantId: 'tenant-1',
      status: 'pending',
      extractedText: 'First sentence about pricing. '.repeat(20) + 'Second topic about refunds. '.repeat(20),
    });
    embeddingService.embedBatch.mockImplementation(async (chunks: string[]) => chunks.map(() => [0.1, 0.2]));

    // eslint-disable-next-line no-new -- constructing registers the job handler via the mocked JobQueue
    new DocumentProcessingService(embeddingService as never, vectorStore as never, prisma as never, {
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    } as never);

    await capturedHandler!({ data: { documentId: 'doc-1', tenantId: 'tenant-1' } });

    expect(vectorStore.deleteByDocumentId).toHaveBeenCalledWith(tenantId, 'knowledge_base', 'doc-1');
    expect(vectorStore.upsert).toHaveBeenCalled();
    expect(prisma.knowledgeBaseDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'completed' }) }),
    );
  });

  it('fails fast (no retry) when the document has no extracted text', async () => {
    const prisma = buildFakePrisma({ id: 'doc-2', tenantId: 'tenant-1', status: 'pending', extractedText: null });

    // eslint-disable-next-line no-new
    new DocumentProcessingService(embeddingService as never, vectorStore as never, prisma as never, {
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    } as never);

    await capturedHandler!({ data: { documentId: 'doc-2', tenantId: 'tenant-1' } });

    expect(prisma.knowledgeBaseDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
    );
    expect(embeddingService.embedBatch).not.toHaveBeenCalled();
  });

  it('onDeadLetter marks the document failed with the failure reason', async () => {
    const prisma = buildFakePrisma({ id: 'doc-3', tenantId: 'tenant-1', status: 'processing', extractedText: 'x' });

    // eslint-disable-next-line no-new
    new DocumentProcessingService(embeddingService as never, vectorStore as never, prisma as never, {
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    } as never);

    await capturedDeadLetterHandler!({
      originalData: { documentId: 'doc-3' },
      failureReason: 'OpenAI rate limited',
      attemptsMade: 3,
    });

    expect(prisma.knowledgeBaseDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed', errorMessage: expect.stringContaining('OpenAI rate limited') }),
      }),
    );
  });
});
