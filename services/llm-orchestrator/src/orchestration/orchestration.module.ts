import { Module } from '@nestjs/common';

import { ConversationStateModule } from '../conversation-state/conversation-state.module';
import { RagClientModule } from '../rag-client/rag-client.module';
import { ToolBrokerModule } from '../tool-broker/tool-broker.module';
import { ToolCatalogModule } from '../tool-catalog/tool-catalog.module';
import { ConversationController } from './conversation.controller';
import { ConversationOrchestratorService } from './conversation-orchestrator.service';

@Module({
  imports: [ConversationStateModule, ToolBrokerModule, ToolCatalogModule, RagClientModule],
  controllers: [ConversationController],
  providers: [ConversationOrchestratorService],
})
export class OrchestrationModule {}
