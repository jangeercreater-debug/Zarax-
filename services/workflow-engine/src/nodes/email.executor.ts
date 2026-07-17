import { Injectable } from '@nestjs/common';

import type { NodeExecutionContext, NodeExecutionResult, NodeExecutor, WorkflowNode } from './node-executor.interface';
import { resolveTemplatesDeep } from './template-resolver';

/**
 * Future-ready: the node type exists (shows in the builder's palette, has a
 * properties panel for to/subject/body), but no email provider is integrated
 * anywhere in this project yet — see services/api's AuthEmailService for the same
 * documented gap on the auth side. This executor resolves and logs what *would* be
 * sent, and returns a clearly-marked `sent: false` result rather than silently
 * pretending delivery happened.
 */
@Injectable()
export class EmailExecutor implements NodeExecutor {
  readonly nodeType = 'email';

  async execute(node: WorkflowNode, context: NodeExecutionContext): Promise<NodeExecutionResult> {
    const resolved = resolveTemplatesDeep(node.data, context.context) as {
      to?: string;
      subject?: string;
      body?: string;
    };

    return {
      output: {
        sent: false,
        reason: 'No email provider is integrated yet — this node is future-ready but not wired to a sender.',
        wouldHaveSent: { to: resolved.to, subject: resolved.subject },
      },
    };
  }
}
