import { ValidationError } from '@zarax/shared-errors';
import { describe, expect, it } from 'vitest';

import { DelayExecutor } from '../delay.executor';

describe('DelayExecutor', () => {
  const executor = new DelayExecutor();
  const context = { tenantId: 't1', executionId: 'e1', context: {} };

  it('returns pauseForMs matching the configured duration — never actually sleeps', async () => {
    const node = { id: 'n1', type: 'delay', data: { durationMs: 5000 } };
    const start = Date.now();
    const result = await executor.execute(node, context);
    expect(Date.now() - start).toBeLessThan(100); // did not block
    expect(result.pauseForMs).toBe(5000);
  });

  it('rejects a zero/negative duration', async () => {
    const node = { id: 'n1', type: 'delay', data: { durationMs: 0 } };
    await expect(executor.execute(node, context)).rejects.toThrow(ValidationError);
  });

  it('rejects a duration over the 24-hour maximum', async () => {
    const node = { id: 'n1', type: 'delay', data: { durationMs: 25 * 60 * 60 * 1000 } };
    await expect(executor.execute(node, context)).rejects.toThrow(ValidationError);
  });
});
