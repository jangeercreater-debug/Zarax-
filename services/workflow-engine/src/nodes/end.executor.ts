import { Injectable } from '@nestjs/common';

import type { NodeExecutionContext, NodeExecutionResult, NodeExecutor, WorkflowNode } from './node-executor.interface';

/** Marks the end of a run. The GraphWalker stops (and marks the execution completed)
 * upon reaching this node type — this executor exists mainly so 'end' is a normal,
 * uniformly-handled node type rather than a special case scattered elsewhere. */
@Injectable()
export class EndExecutor implements NodeExecutor {
  readonly nodeType = 'end';

  async execute(node: WorkflowNode, context: NodeExecutionContext): Promise<NodeExecutionResult> {
    return { output: { finalOutput: (node.data.outputField as string | undefined) ? context.context[node.data.outputField as string] : context.context } };
  }
}
