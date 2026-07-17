import { Injectable } from '@nestjs/common';

import type { NodeExecutionContext, NodeExecutionResult, NodeExecutor, WorkflowNode } from './node-executor.interface';

/**
 * The starting point of every workflow — a no-op at execution time (there's nothing
 * to "do", it just marks where the run begins). The trigger node's `data.eventType`
 * (e.g. 'manual' | 'call.ended') is metadata for a *future* event-driven
 * auto-triggering feature that isn't built yet — every run today starts from a
 * manual "Test Workflow" / "Run now" call (see services/api's WorkflowsService.execute()).
 */
@Injectable()
export class TriggerExecutor implements NodeExecutor {
  readonly nodeType = 'trigger';

  async execute(_node: WorkflowNode, context: NodeExecutionContext): Promise<NodeExecutionResult> {
    return { output: context.context.input ?? {} };
  }
}
