import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { InternalTokenGuard, Public } from '@zarax/shared-auth';

import { EmbeddingService } from './embedding.service';

/** Called by services/api's MemoryVectorService to embed memory text for semantic
 * search — no JWT, protected by the shared INTERNAL_SERVICE_TOKEN, same pattern as
 * services/api's internal/agents endpoint. */
@Public()
@UseGuards(InternalTokenGuard)
@Controller('internal/embeddings')
export class InternalEmbeddingsController {
  constructor(private readonly embeddingService: EmbeddingService) {}

  @Post()
  async embed(@Body() body: { texts: string[] }): Promise<{ embeddings: number[][] }> {
    const embeddings = await this.embeddingService.embedBatch(body.texts ?? []);
    return { embeddings };
  }
}
