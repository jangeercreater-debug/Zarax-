import { Body, Controller, Post } from '@nestjs/common';
import { CurrentPrincipal, RequirePermission } from '@zarax/shared-auth';
import { PERMISSIONS, type Principal } from '@zarax/shared-types';

import type {
  IngestDocumentResponseDto,
  SearchKnowledgeBaseResponseDto,
} from './dto/knowledge-base-response.dto';
import { IngestDocumentDto } from './dto/ingest-document.dto';
import { SearchKnowledgeBaseDto } from './dto/search-knowledge-base.dto';
import { KnowledgeBaseService } from './knowledge-base.service';

@Controller()
export class KnowledgeBaseController {
  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  @RequirePermission(PERMISSIONS.KNOWLEDGE_BASE_MANAGE)
  @Post('documents')
  async ingest(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: IngestDocumentDto,
  ): Promise<IngestDocumentResponseDto> {
    return this.knowledgeBaseService.ingestDocument(principal.tenantId, dto);
  }

  /**
   * No @RequirePermission beyond authentication — this endpoint is called both by
   * human-facing tenant traffic (via the gateway) and by llm-orchestrator acting as a
   * service_account Principal (see /docs/auth-design.md) during a live call, so it
   * intentionally accepts any authenticated Principal type.
   */
  @Post('search')
  async search(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: SearchKnowledgeBaseDto,
  ): Promise<SearchKnowledgeBaseResponseDto> {
    return this.knowledgeBaseService.search(principal.tenantId, dto.query, dto.limit);
  }
}
