import { Injectable } from '@nestjs/common';
import { ValidationError } from '@zarax/shared-errors';

import { RagSearchClient } from '../clients/rag-search.client';
import type { NodeExecutionContext, NodeExecutionResult, NodeExecutor, WorkflowNode } from './node-executor.interface';
import { resolveTemplate } from './template-resolver';

/** Searches the tenant's knowledge base via rag-service's existing /search endpoint —
 * reuses its full chunking/embedding pipeline; this executor has zero retrieval
 * logic of its own. */
@Injectable()
export class KnowledgeBaseExecutor implements NodeExecutor {
  readonly nodeType = 'knowledge_base';

  constructor(private readonly ragSearchClient: RagSearchClient) {}

  async execute(node: WorkflowNode, context: NodeExecutionContext): Promise<NodeExecutionResult> {
    const queryTemplate = node.data.query as string | undefined;
    if (!queryTemplate) {
      throw new ValidationError(`Knowledge Base node '${node.id}' has no query configured.`);
    }

    const query = String(resolveTemplate(queryTemplate, context.context) ?? '');
    const limit = Number(node.data.limit ?? 5);

    const result = await this.ragSearchClient.search(context.tenantId, query, limit);
    return { output: result };
  }
}
