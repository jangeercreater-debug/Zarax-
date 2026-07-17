import { Injectable } from '@nestjs/common';
import { ValidationError } from '@zarax/shared-errors';

import type { NodeExecutionContext, NodeExecutionResult, NodeExecutor, WorkflowNode } from './node-executor.interface';

const MAX_DELAY_MS = 24 * 60 * 60 * 1000; // 24h — a generous ceiling; longer delays need a real scheduler, not a job queue

/** Does not actually sleep — that would block a shared worker thread for potentially
 * minutes/hours. Returns pauseForMs so the consumer re-enqueues a continuation job
 * (a native BullMQ delayed job — see @zarax/job-queue's add({ delayMs })) instead. */
@Injectable()
export class DelayExecutor implements NodeExecutor {
  readonly nodeType = 'delay';

  async execute(node: WorkflowNode, _context: NodeExecutionContext): Promise<NodeExecutionResult> {
    const durationMs = Number(node.data.durationMs ?? 0);

    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new ValidationError(`Delay node '${node.id}' has an invalid duration.`);
    }
    if (durationMs > MAX_DELAY_MS) {
      throw new ValidationError(`Delay node '${node.id}' exceeds the 24-hour maximum.`);
    }

    return { output: { durationMs }, pauseForMs: durationMs };
  }
}
