import { Injectable } from '@nestjs/common';
import { ValidationError } from '@zarax/shared-errors';

import { LlmOrchestratorClient } from '../clients/llm-orchestrator.client';
import type { NodeExecutionContext, NodeExecutionResult, NodeExecutor, WorkflowNode } from './node-executor.interface';
import { resolveTemplate } from './template-resolver';

/** Sends a message through llm-orchestrator's real conversation pipeline for a
 * configured agent — the same reuse pattern as services/api's "Test Agent" feature,
 * just triggered from a workflow instead of the dashboard. Tool-calling, RAG
 * augmentation, and usage/cost metering all apply automatically since it's the exact
 * same endpoint. */
@Injectable()
export class AiAgentExecutor implements NodeExecutor {
  readonly nodeType = 'ai_agent';

  constructor(private readonly llmOrchestratorClient: LlmOrchestratorClient) {}

  async execute(node: WorkflowNode, context: NodeExecutionContext): Promise<NodeExecutionResult> {
    const agentId = node.data.agentId as string | undefined;
    const messageTemplate = (node.data.message as string | undefined) ?? '{{trigger.message}}';

    if (!agentId) {
      throw new ValidationError(`AI Agent node '${node.id}' has no agent selected.`);
    }

    const message = String(resolveTemplate(messageTemplate, context.context) ?? '');
    const result = await this.llmOrchestratorClient.sendTurn(agentId, message);

    return { output: result };
  }
}
