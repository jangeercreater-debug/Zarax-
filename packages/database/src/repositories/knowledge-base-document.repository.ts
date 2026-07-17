import type { Prisma, PrismaClient, KnowledgeBaseDocument as PrismaDoc } from '@prisma/client';
import { NotFoundError } from '@zarax/shared-errors';
import type { TenantId } from '@zarax/shared-types';

import { TenantScopedRepository } from './tenant-scoped.repository';

export type DocumentSourceType = 'pdf' | 'docx' | 'txt' | 'url';
export type DocumentStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface KnowledgeBaseDocumentRecord {
  id: string;
  tenantId: string;
  name: string;
  sourceType: DocumentSourceType;
  sourceUrl: string | null;
  extractedText: string | null;
  status: DocumentStatus;
  chunkCount: number;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toRecord(doc: PrismaDoc): KnowledgeBaseDocumentRecord {
  return {
    id: doc.id,
    tenantId: doc.tenantId,
    name: doc.name,
    sourceType: doc.sourceType as DocumentSourceType,
    sourceUrl: doc.sourceUrl,
    extractedText: doc.extractedText,
    status: doc.status as DocumentStatus,
    chunkCount: doc.chunkCount,
    errorMessage: doc.errorMessage,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class KnowledgeBaseDocumentRepository extends TenantScopedRepository<
  PrismaDoc,
  Prisma.KnowledgeBaseDocumentWhereInput
> {
  constructor(private readonly prisma: PrismaClient) {
    super(prisma.knowledgeBaseDocument);
  }

  async create(params: {
    tenantId: TenantId;
    name: string;
    sourceType: DocumentSourceType;
    sourceUrl?: string;
    extractedText: string;
  }): Promise<KnowledgeBaseDocumentRecord> {
    const doc = await this.prisma.knowledgeBaseDocument.create({
      data: {
        tenantId: params.tenantId,
        name: params.name,
        sourceType: params.sourceType,
        sourceUrl: params.sourceUrl,
        extractedText: params.extractedText,
      },
    });
    return toRecord(doc);
  }

  async findByIdForTenantOrThrow(tenantId: TenantId, id: string): Promise<KnowledgeBaseDocumentRecord> {
    const doc = await this.findFirstForTenant(tenantId, { id });
    if (!doc) throw new NotFoundError('KnowledgeBaseDocument', id);
    return toRecord(doc);
  }

  async listForTenant(
    tenantId: TenantId,
    filters: { status?: DocumentStatus; sourceType?: DocumentSourceType } = {},
  ): Promise<KnowledgeBaseDocumentRecord[]> {
    const docs = await this.prisma.knowledgeBaseDocument.findMany({
      where: {
        tenantId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.sourceType ? { sourceType: filters.sourceType } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return docs.map(toRecord);
  }

  async markProcessing(id: string): Promise<void> {
    await this.prisma.knowledgeBaseDocument.update({ where: { id }, data: { status: 'processing' } });
  }

  async markCompleted(id: string, chunkCount: number): Promise<void> {
    await this.prisma.knowledgeBaseDocument.update({
      where: { id },
      data: { status: 'completed', chunkCount, errorMessage: null },
    });
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    await this.prisma.knowledgeBaseDocument.update({
      where: { id },
      data: { status: 'failed', errorMessage },
    });
  }

  async delete(tenantId: TenantId, id: string): Promise<void> {
    const result = await this.prisma.knowledgeBaseDocument.deleteMany({ where: { id, tenantId } });
    if (result.count === 0) throw new NotFoundError('KnowledgeBaseDocument', id);
  }
}
