import { Controller, Get, UseGuards } from '@nestjs/common';
import { InternalTokenGuard } from '@zarax/shared-auth';

import { ToolRegistryService } from './registry/tool-registry.service';

/**
 * Exposes only tool *metadata* (name/description/JSON schema) — never credentials or
 * execution capability (actual execution stays gated behind the event-bus consumer,
 * which looks up per-tenant Agent config before running a handler) — but still
 * guarded by the shared internal-service token, consistent with stt-service/
 * tts-service, since this is still an internal-only service with no tenant-facing
 * traffic.
 */
@UseGuards(InternalTokenGuard)
@Controller('tools')
export class ToolsController {
  constructor(private readonly registry: ToolRegistryService) {}

  @Get()
  list(): ReturnType<ToolRegistryService['listForLLM']> {
    return this.registry.listForLLM();
  }
}
