import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RateLimit } from '@zarax/api-standards';
import { CurrentPrincipal, RequirePermission, resolveEffectiveTenantId } from '@zarax/shared-auth';
import { PERMISSIONS, type Principal } from '@zarax/shared-types';

import type {
  DocumentResponseDto,
  IngestDocumentResponseDto,
  SearchKnowledgeBaseResponseDto,
} from './dto/knowledge-base-response.dto';
import { IngestDocumentDto } from './dto/ingest-document.dto';
import { IngestUrlDto } from './dto/ingest-url.dto';
import { ListDocumentsDto } from './dto/list-documents.dto';
import { SearchKnowledgeBaseDto } from './dto/search-knowledge-base.dto';
import { KnowledgeBaseService } from './knowledge-base.service';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB

@ApiTags('knowledge-base')
@Controller()
export class KnowledgeBaseController {
  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  @RequirePermission(PERMISSIONS.KNOWLEDGE_BASE_MANAGE)
  @ApiOperation({ summary: 'Ingest raw text directly (no file).' })
  @Post('documents')
  async ingestText(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: IngestDocumentDto,
  ): Promise<IngestDocumentResponseDto> {
    const doc = await this.knowledgeBaseService.ingestText(principal.tenantId, principal, dto);
    return { documentId: doc.id, chunksIndexed: doc.chunkCount };
  }

  @RequirePermission(PERMISSIONS.KNOWLEDGE_BASE_MANAGE)
  @RateLimit({ limit: 20, windowMs: 60_000 })
  @ApiOperation({ summary: 'Upload a PDF, DOCX, or TXT file for ingestion.' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  @Post('documents/upload')
  async uploadFile(
    @CurrentPrincipal() principal: Principal,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<DocumentResponseDto> {
    if (!file) {
      throw new BadRequestException('No file was uploaded — expected a multipart field named "file".');
    }
    return this.knowledgeBaseService.ingestFile(principal.tenantId, principal, {
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalname: file.originalname,
      size: file.size,
    });
  }

  @RequirePermission(PERMISSIONS.KNOWLEDGE_BASE_MANAGE)
  @RateLimit({ limit: 20, windowMs: 60_000 })
  @ApiOperation({ summary: 'Ingest a single web page by URL.' })
  @Post('documents/url')
  async ingestUrl(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: IngestUrlDto,
  ): Promise<DocumentResponseDto> {
    return this.knowledgeBaseService.ingestUrl(principal.tenantId, principal, dto.url, dto.name);
  }

  @RequirePermission(PERMISSIONS.KNOWLEDGE_BASE_MANAGE)
  @ApiOperation({ summary: 'List knowledge base documents for the tenant, optionally filtered.' })
  @Get('documents')
  async listDocuments(
    @CurrentPrincipal() principal: Principal,
    @Query() filters: ListDocumentsDto,
  ): Promise<DocumentResponseDto[]> {
    return this.knowledgeBaseService.listDocuments(principal.tenantId, filters);
  }

  @RequirePermission(PERMISSIONS.KNOWLEDGE_BASE_MANAGE)
  @ApiOperation({ summary: 'Get one document, including its processing status.' })
  @Get('documents/:id')
  async getDocument(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ): Promise<DocumentResponseDto> {
    return this.knowledgeBaseService.getDocument(principal.tenantId, id);
  }

  @RequirePermission(PERMISSIONS.KNOWLEDGE_BASE_MANAGE)
  @ApiOperation({ summary: 'Delete a document and its indexed chunks.' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('documents/:id')
  async deleteDocument(@CurrentPrincipal() principal: Principal, @Param('id') id: string): Promise<void> {
    await this.knowledgeBaseService.deleteDocument(principal.tenantId, principal, id);
  }

  @RequirePermission(PERMISSIONS.KNOWLEDGE_BASE_MANAGE)
  @ApiOperation({
    summary: 'Re-index a document — re-chunks/re-embeds from its already-stored extracted text.',
  })
  @HttpCode(HttpStatus.OK)
  @Post('documents/:id/reindex')
  async reindexDocument(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ): Promise<DocumentResponseDto> {
    return this.knowledgeBaseService.reindexDocument(principal.tenantId, principal, id);
  }

  /**
   * No @RequirePermission beyond authentication — this endpoint is called both by
   * human-facing tenant traffic (via the gateway) and by llm-orchestrator acting as a
   * service_account Principal (see /docs/auth-design.md) during a live call, so it
   * intentionally accepts any authenticated Principal type. For a service_account
   * caller, `dto.tenantId` is required and used instead of the service account's own
   * bound tenant — see resolveEffectiveTenantId's doc comment for why.
   */
  @Post('search')
  async search(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: SearchKnowledgeBaseDto,
  ): Promise<SearchKnowledgeBaseResponseDto> {
    const tenantId = resolveEffectiveTenantId(principal, dto.tenantId);
    return this.knowledgeBaseService.search(tenantId, dto.query, dto.limit);
  }
}
