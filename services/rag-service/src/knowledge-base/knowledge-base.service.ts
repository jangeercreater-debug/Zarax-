import { Inject, Injectable } from '@nestjs/common';
import { AuditLogService } from '@zarax/audit-log';
import {
  KnowledgeBaseDocumentRepository,
  PRISMA_CLIENT,
  type DocumentSourceType,
  type PrismaClient,
} from '@zarax/database';
import { VectorStoreService } from '@zarax/qdrant-client';
import { ValidationError } from '@zarax/shared-errors';
import type { Principal, TenantId } from '@zarax/shared-types';

import { detectSourceType, extractFileText } from '../extractors/file-extractor';
import { UrlExtractorService } from '../extractors/url-extractor';
import { DocumentProcessingService } from '../processing/document-processing.service';
import { EmbeddingService } from '../embeddings/embedding.service';
import { VECTOR_STORE } from './knowledge-base.module';
import type { DocumentResponseDto, SearchKnowledgeBaseResponseDto } from './dto/knowledge-base-response.dto';
import type { IngestDocumentDto } from './dto/ingest-document.dto';
import type { ListDocumentsDto } from './dto/list-documents.dto';

const DEFAULT_SEARCH_LIMIT = 5;

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

function toResponseDto(doc: {
  id: string;
  name: string;
  sourceType: DocumentSourceType;
  sourceUrl: string | null;
  status: string;
  chunkCount: number;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}): DocumentResponseDto {
  return {
    id: doc.id,
    name: doc.name,
    sourceType: doc.sourceType,
    sourceUrl: doc.sourceUrl,
    status: doc.status as DocumentResponseDto['status'],
    chunkCount: doc.chunkCount,
    errorMessage: doc.errorMessage,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

@Injectable()
export class KnowledgeBaseService {
  private readonly documentRepository: KnowledgeBaseDocumentRepository;

  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly urlExtractor: UrlExtractorService,
    private readonly processingService: DocumentProcessingService,
    private readonly auditLogService: AuditLogService,
    @Inject(VECTOR_STORE) private readonly vectorStore: VectorStoreService,
    @Inject(PRISMA_CLIENT) prisma: PrismaClient,
  ) {
    this.documentRepository = new KnowledgeBaseDocumentRepository(prisma);
  }

  /** Every ingestion path (raw text, file upload, URL) converges here: extraction is
   * synchronous (fast — CPU-bound file parsing or a single HTTP fetch) and the
   * document is created immediately; chunking/embedding/Qdrant indexing (the
   * network-dependent, potentially slow part) runs asynchronously via
   * DocumentProcessingService. This is the one place chunk/embed/index logic is
   * triggered from — no ingestion path re-implements it. */
  private async createAndEnqueue(params: {
    tenantId: TenantId;
    principal: Principal;
    name: string;
    sourceType: DocumentSourceType;
    sourceUrl?: string;
    extractedText: string;
  }): Promise<DocumentResponseDto> {
    if (!params.extractedText.trim()) {
      throw new ValidationError('No text content found to ingest.');
    }

    const doc = await this.documentRepository.create({
      tenantId: params.tenantId,
      name: params.name,
      sourceType: params.sourceType,
      sourceUrl: params.sourceUrl,
      extractedText: params.extractedText,
    });

    await this.processingService.enqueue(doc.id, params.tenantId);

    await this.auditLogService.record({
      principal: params.principal,
      action: 'knowledge_base.document_uploaded',
      resourceType: 'knowledge_base_document',
      resourceId: doc.id,
      metadata: { sourceType: params.sourceType, name: params.name },
    });

    return toResponseDto(doc);
  }

  async ingestText(
    tenantId: TenantId,
    principal: Principal,
    dto: IngestDocumentDto,
  ): Promise<DocumentResponseDto> {
    return this.createAndEnqueue({
      tenantId,
      principal,
      name: (dto.metadata?.name as string | undefined) ?? 'Untitled text document',
      sourceType: 'txt',
      extractedText: dto.text,
    });
  }

  async ingestFile(
    tenantId: TenantId,
    principal: Principal,
    file: UploadedFile,
  ): Promise<DocumentResponseDto> {
    const sourceType = detectSourceType(file.mimetype, file.originalname);
    const extractedText = await extractFileText(sourceType, file.buffer);

    return this.createAndEnqueue({
      tenantId,
      principal,
      name: file.originalname,
      sourceType,
      extractedText,
    });
  }

  async ingestUrl(
    tenantId: TenantId,
    principal: Principal,
    url: string,
    name?: string,
  ): Promise<DocumentResponseDto> {
    const extractedText = await this.urlExtractor.extract(url);

    return this.createAndEnqueue({
      tenantId,
      principal,
      name: name ?? url,
      sourceType: 'url',
      sourceUrl: url,
      extractedText,
    });
  }

  async listDocuments(tenantId: TenantId, filters: ListDocumentsDto): Promise<DocumentResponseDto[]> {
    const docs = await this.documentRepository.listForTenant(tenantId, filters);
    return docs.map(toResponseDto);
  }

  async getDocument(tenantId: TenantId, id: string): Promise<DocumentResponseDto> {
    const doc = await this.documentRepository.findByIdForTenantOrThrow(tenantId, id);
    return toResponseDto(doc);
  }

  async deleteDocument(tenantId: TenantId, principal: Principal, id: string): Promise<void> {
    await this.documentRepository.findByIdForTenantOrThrow(tenantId, id); // 404s if missing
    await this.vectorStore.deleteByDocumentId(tenantId, 'knowledge_base', id);
    await this.documentRepository.delete(tenantId, id);

    await this.auditLogService.record({
      principal,
      action: 'knowledge_base.document_deleted',
      resourceType: 'knowledge_base_document',
      resourceId: id,
    });
  }

  /** Re-runs chunking/embedding/indexing from the already-stored extracted text — does
   * NOT re-fetch a URL or re-parse an original file (neither is kept around; see the
   * schema comment on KnowledgeBaseDocument). Useful after a chunking-strategy change
   * or to recover from a failed processing run. */
  async reindexDocument(tenantId: TenantId, principal: Principal, id: string): Promise<DocumentResponseDto> {
    const doc = await this.documentRepository.findByIdForTenantOrThrow(tenantId, id);
    await this.processingService.enqueue(doc.id, tenantId);

    await this.auditLogService.record({
      principal,
      action: 'knowledge_base.document_reindexed',
      resourceType: 'knowledge_base_document',
      resourceId: id,
    });

    return toResponseDto(doc);
  }

  async search(
    tenantId: TenantId,
    query: string,
    limit: number = DEFAULT_SEARCH_LIMIT,
  ): Promise<SearchKnowledgeBaseResponseDto> {
    const queryEmbedding = await this.embeddingService.embedOne(query);
    const results = await this.vectorStore.search<{
      text: string;
      documentId: string;
      chunkIndex: number;
      [key: string]: unknown;
    }>(tenantId, 'knowledge_base', queryEmbedding, limit);

    return {
      results: results.map((result) => {
        const { text, documentId: _documentId, chunkIndex: _chunkIndex, ...metadata } = result.payload;
        return { text, score: result.score, metadata };
      }),
    };
  }
}
