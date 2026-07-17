import { NotFoundError, ValidationError } from '@zarax/shared-errors';
import { asTenantId, asUserId, type UserPrincipal } from '@zarax/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { KnowledgeBaseService } from '../knowledge-base.service';

function buildPrincipal(): UserPrincipal {
  return {
    type: 'user',
    id: asUserId('user-1'),
    tenantId: asTenantId('tenant-1'),
    email: 'a@b.com',
    roles: ['owner'],
    permissions: ['*'],
  };
}

function buildFakePrisma() {
  const docs = new Map<string, Record<string, unknown>>();
  let counter = 0;

  return {
    _docs: docs,
    knowledgeBaseDocument: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        counter += 1;
        const doc = {
          id: `doc-${counter}`,
          status: 'pending',
          chunkCount: 0,
          errorMessage: null,
          sourceUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        docs.set(doc.id as string, doc);
        return doc;
      }),
      findFirst: vi.fn(async ({ where }: { where: { id?: string; tenantId: string } }) => {
        if (!where.id) return null;
        const doc = docs.get(where.id);
        return doc && doc.tenantId === where.tenantId ? doc : null;
      }),
      findMany: vi.fn(async ({ where }: { where: { tenantId: string } }) =>
        [...docs.values()].filter((d) => d.tenantId === where.tenantId),
      ),
      deleteMany: vi.fn(async ({ where }: { where: { id: string; tenantId: string } }) => {
        const doc = docs.get(where.id);
        if (doc && doc.tenantId === where.tenantId) {
          docs.delete(where.id);
          return { count: 1 };
        }
        return { count: 0 };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const doc = docs.get(where.id);
        Object.assign(doc as object, data);
        return doc;
      }),
    },
  };
}

function buildDeps() {
  const embeddingService = { embedBatch: vi.fn(), embedOne: vi.fn() };
  const urlExtractor = { extract: vi.fn() };
  const processingService = { enqueue: vi.fn() };
  const auditLogService = { record: vi.fn() };
  const vectorStore = { upsert: vi.fn(), search: vi.fn(), deleteByDocumentId: vi.fn() };
  const prisma = buildFakePrisma();

  return { embeddingService, urlExtractor, processingService, auditLogService, vectorStore, prisma };
}

function buildService(deps: ReturnType<typeof buildDeps>) {
  return new KnowledgeBaseService(
    deps.embeddingService as never,
    deps.urlExtractor as never,
    deps.processingService as never,
    deps.auditLogService as never,
    deps.vectorStore as never,
    deps.prisma as never,
  );
}

describe('KnowledgeBaseService', () => {
  const tenantId = asTenantId('tenant-1');
  const principal = buildPrincipal();
  let deps: ReturnType<typeof buildDeps>;

  beforeEach(() => {
    deps = buildDeps();
  });

  it('ingestText creates a document and enqueues processing (does not chunk/embed synchronously)', async () => {
    const service = buildService(deps);
    const doc = await service.ingestText(tenantId, principal, { text: 'Some knowledge base content.' });

    expect(doc.status).toBe('pending');
    expect(deps.processingService.enqueue).toHaveBeenCalledWith(doc.id, tenantId);
    expect(deps.embeddingService.embedBatch).not.toHaveBeenCalled(); // that's the worker's job, not the request handler's
    expect(deps.auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'knowledge_base.document_uploaded' }),
    );
  });

  it('ingestText rejects empty text without creating a document', async () => {
    const service = buildService(deps);
    await expect(service.ingestText(tenantId, principal, { text: '   ' })).rejects.toThrow(ValidationError);
    expect(deps.processingService.enqueue).not.toHaveBeenCalled();
  });

  it('ingestUrl extracts text via UrlExtractorService then enqueues processing', async () => {
    deps.urlExtractor.extract.mockResolvedValue('Extracted page content.');
    const service = buildService(deps);

    const doc = await service.ingestUrl(tenantId, principal, 'https://example.com/faq');

    expect(deps.urlExtractor.extract).toHaveBeenCalledWith('https://example.com/faq');
    expect(doc.sourceType).toBe('url');
    expect(doc.sourceUrl).toBe('https://example.com/faq');
  });

  it('deleteDocument removes vectors from Qdrant before deleting the DB row', async () => {
    const service = buildService(deps);
    const doc = await service.ingestText(tenantId, principal, { text: 'content' });

    await service.deleteDocument(tenantId, principal, doc.id);

    expect(deps.vectorStore.deleteByDocumentId).toHaveBeenCalledWith(tenantId, 'knowledge_base', doc.id);
    await expect(service.getDocument(tenantId, doc.id)).rejects.toThrow(NotFoundError);
  });

  it('reindexDocument re-enqueues processing for an existing document', async () => {
    const service = buildService(deps);
    const doc = await service.ingestText(tenantId, principal, { text: 'content' });
    deps.processingService.enqueue.mockClear();

    await service.reindexDocument(tenantId, principal, doc.id);

    expect(deps.processingService.enqueue).toHaveBeenCalledWith(doc.id, tenantId);
  });

  it('reindexDocument throws NotFoundError for a document in another tenant', async () => {
    const service = buildService(deps);
    const doc = await service.ingestText(tenantId, principal, { text: 'content' });

    await expect(
      service.reindexDocument(asTenantId('other-tenant'), principal, doc.id),
    ).rejects.toThrow(NotFoundError);
  });

  it('embeds the query and maps search results, excluding internal payload fields', async () => {
    deps.embeddingService.embedOne.mockResolvedValue([0.5, 0.6]);
    deps.vectorStore.search.mockResolvedValue([
      {
        id: 'p1',
        score: 0.92,
        payload: { text: 'Refunds are processed in 5-7 days.', documentId: 'doc-1', chunkIndex: 0, source: 'faq.md' },
      },
    ]);

    const service = buildService(deps);
    const result = await service.search(tenantId, 'What is the refund policy?', 3);

    expect(deps.embeddingService.embedOne).toHaveBeenCalledWith('What is the refund policy?');
    expect(deps.vectorStore.search).toHaveBeenCalledWith(tenantId, 'knowledge_base', [0.5, 0.6], 3);
    expect(result.results).toEqual([
      { text: 'Refunds are processed in 5-7 days.', score: 0.92, metadata: { source: 'faq.md' } },
    ]);
  });
});
