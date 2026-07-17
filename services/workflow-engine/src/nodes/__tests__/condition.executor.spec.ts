import { ValidationError } from '@zarax/shared-errors';
import { describe, expect, it } from 'vitest';

import { ConditionExecutor } from '../condition.executor';

describe('ConditionExecutor', () => {
  const executor = new ConditionExecutor();
  const baseContext = { tenantId: 't1', executionId: 'e1', context: { trigger: { status: 'vip', score: 42 } } };

  it('branches true on equals match', async () => {
    const node = { id: 'n1', type: 'condition', data: { field: '{{trigger.status}}', operator: 'equals', value: 'vip' } };
    const result = await executor.execute(node, baseContext);
    expect(result.branch).toBe('true');
  });

  it('branches false on equals mismatch', async () => {
    const node = { id: 'n1', type: 'condition', data: { field: '{{trigger.status}}', operator: 'equals', value: 'regular' } };
    const result = await executor.execute(node, baseContext);
    expect(result.branch).toBe('false');
  });

  it('supports greater_than on numeric values', async () => {
    const node = { id: 'n1', type: 'condition', data: { field: '{{trigger.score}}', operator: 'greater_than', value: 10 } };
    const result = await executor.execute(node, baseContext);
    expect(result.branch).toBe('true');
  });

  it('supports is_empty', async () => {
    const node = { id: 'n1', type: 'condition', data: { field: '{{trigger.missing}}', operator: 'is_empty' } };
    const result = await executor.execute(node, baseContext);
    expect(result.branch).toBe('true');
  });

  it('throws ValidationError when field/operator are missing', async () => {
    const node = { id: 'n1', type: 'condition', data: {} };
    await expect(executor.execute(node, baseContext)).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError for an unknown operator', async () => {
    const node = { id: 'n1', type: 'condition', data: { field: 'x', operator: 'bogus' } };
    await expect(executor.execute(node, baseContext)).rejects.toThrow(ValidationError);
  });
});
