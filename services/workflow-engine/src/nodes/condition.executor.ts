import { Injectable } from '@nestjs/common';
import { ValidationError } from '@zarax/shared-errors';

import type { NodeExecutionContext, NodeExecutionResult, NodeExecutor, WorkflowNode } from './node-executor.interface';
import { resolveTemplate } from './template-resolver';

export const CONDITION_OPERATORS = [
  'equals',
  'not_equals',
  'contains',
  'greater_than',
  'less_than',
  'is_empty',
  'is_not_empty',
] as const;

function evaluate(operator: string, actual: unknown, expected: unknown): boolean {
  switch (operator) {
    case 'equals':
      return String(actual) === String(expected);
    case 'not_equals':
      return String(actual) !== String(expected);
    case 'contains':
      return String(actual ?? '').includes(String(expected ?? ''));
    case 'greater_than':
      return Number(actual) > Number(expected);
    case 'less_than':
      return Number(actual) < Number(expected);
    case 'is_empty':
      return actual === undefined || actual === null || actual === '';
    case 'is_not_empty':
      return actual !== undefined && actual !== null && actual !== '';
    default:
      throw new ValidationError(`Unknown condition operator: '${operator}'`);
  }
}

@Injectable()
export class ConditionExecutor implements NodeExecutor {
  readonly nodeType = 'condition';

  async execute(node: WorkflowNode, context: NodeExecutionContext): Promise<NodeExecutionResult> {
    const field = node.data.field as string | undefined;
    const operator = node.data.operator as string | undefined;
    const expectedValue = node.data.value;

    if (!field || !operator) {
      throw new ValidationError(
        `Condition node '${node.id}' is missing its field/operator configuration.`,
      );
    }

    const actualValue = resolveTemplate(field, context.context);
    const resolvedExpected = resolveTemplate(expectedValue, context.context);
    const result = evaluate(operator, actualValue, resolvedExpected);

    return {
      output: { field, operator, actualValue, result },
      branch: result ? 'true' : 'false',
    };
  }
}
