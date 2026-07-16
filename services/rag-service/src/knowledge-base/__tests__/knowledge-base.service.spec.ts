import { asTenantId } from '@zarax/shared-types';
import { describe, expect, it, vi } from 'vitest';

import { KnowledgeBaseService } from '../knowledge-base.service';

function buildEmbeddingServiceMock() {
  return {
    embedBatch: vi.fn(),
    embedOne: vi.fn(),
  };
}

function buildVectorStoreMock() {
  return {
    upsert: vi.fn(),
    search: vi.fn(),
  };
}

describe('KnowledgeBaseService', () => {
  const tenantId = asTenantId('tenant-1');

  it('chunks the document, embeds each chunk, and upserts them all', async () => {
    const embeddingService = buildEmbeddingServiceMock();
    const vectorStore = buildVectorStoreMock();
    embeddingService.embedBatch.mockResolvedValue([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);

    const service = new KnowledgeBaseService(embeddingService as never, vectorStore as never);
    const longText =
      'First sentence about ZaraX pricing. '.repeat(30) + 'Second topic about refunds. '.repeat(30);

    const result = await service.ingestDocument(tenantId, { text: longText });

    expect(result.chunksIndexed).toBeGreaterThan(0);
    expect(vectorStore.upsert).toHaveBeenCalledWith(
      tenantId,
      'knowledge_base',
      expect.arrayContaining([
        expect.objectContaining({ payload: expect.objectContaining({ documentId: result.documentId }) }),
      ]),
    );
  });

  it('returns zero chunksIndexed for empty document text without calling embed/upsert', async () => {
    const embeddingService = buildEmbeddingServiceMock();
    const vectorStore = buildVectorStoreMock();

    const service = new KnowledgeBaseService(embeddingService as never, vectorStore as never);
    const result = await service.ingestDocument(tenantId, { text: '   ' });

    expect(result.chunksIndexed).toBe(0);
    expect(embeddingService.embedBatch).not.toHaveBeenCalled();
    expect(vectorStore.upsert).not.toHaveBeenCalled();
  });

  it('embeds the query and maps search results, excluding internal payload fields', async () => {
    const embeddingService = buildEmbeddingServiceMock();
    const vectorStore = buildVectorStoreMock();
    embeddingService.embedOne.mockResolvedValue([0.5, 0.6]);
    vectorStore.search.mockResolvedValue([
      {
        id: 'p1',
        score: 0.92,
        payload: { text: 'Refunds are processed in 5-7 days.', documentId: 'doc-1', chunkIndex: 0, source: 'faq.md' },
      },
    ]);

    const service = new KnowledgeBaseService(embeddingService as never, vectorStore as never);
    const result = await service.search(tenantId, 'What is the refund policy?', 3);

    expect(embeddingService.embedOne).toHaveBeenCalledWith('What is the refund policy?');
    expect(vectorStore.search).toHaveBeenCalledWith(tenantId, 'knowledge_base', [0.5, 0.6], 3);
    expect(result.results).toEqual([
      { text: 'Refunds are processed in 5-7 days.', score: 0.92, metadata: { source: 'faq.md' } },
    ]);
  });
});
