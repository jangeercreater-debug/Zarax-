import { Module } from '@nestjs/common';

import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { LlmOrchestratorClient } from './clients/llm-orchestrator.client';
import { ToolCatalogClient } from './clients/tool-catalog.client';

@Module({
  controllers: [AgentsController],
  providers: [AgentsService, LlmOrchestratorClient, ToolCatalogClient],
})
export class AgentsModule {}
