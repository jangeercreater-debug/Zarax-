import { Module } from '@nestjs/common';

import { LlmOrchestratorClient } from '../clients/llm-orchestrator.client';
import { RagSearchClient } from '../clients/rag-search.client';
import { AiAgentExecutor } from '../nodes/ai-agent.executor';
import { ConditionExecutor } from '../nodes/condition.executor';
import { DelayExecutor } from '../nodes/delay.executor';
import { EmailExecutor } from '../nodes/email.executor';
import { EndExecutor } from '../nodes/end.executor';
import { HttpNodeExecutor } from '../nodes/http.executor';
import { KnowledgeBaseExecutor } from '../nodes/knowledge-base.executor';
import { TriggerExecutor } from '../nodes/trigger.executor';
import { WorkflowExecutionConsumer } from './workflow-execution.consumer';

@Module({
  providers: [
    LlmOrchestratorClient,
    RagSearchClient,
    TriggerExecutor,
    AiAgentExecutor,
    KnowledgeBaseExecutor,
    ConditionExecutor,
    DelayExecutor,
    HttpNodeExecutor,
    EmailExecutor,
    EndExecutor,
    WorkflowExecutionConsumer,
  ],
})
export class ExecutionModule {}
