import { Module } from '@nestjs/common';

import { ConversationStateModule } from '../conversation-state/conversation-state.module';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { MemoryClientModule } from '../memory-client/memory-client.module';
import { RagClientModule } from '../rag-client/rag-client.module';
import { ToolBrokerModule } from '../tool-broker/tool-broker.module';
import { ToolCatalogModule } from '../tool-catalog/tool-catalog.module';
import { ConversationController } from './conversation.controller';
import { ConversationOrchestratorService } from './conversation-orchestrator.service';

@Module({
  imports: [ConversationStateModule, ToolBrokerModule, ToolCatalogModule, RagClientModule, MemoryClientModule, IntelligenceModule],
  controllers: [ConversationController],
  providers: [ConversationOrchestratorService],
})
export class OrchestrationModule {}
