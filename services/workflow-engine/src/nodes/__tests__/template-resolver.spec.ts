import { describe, expect, it } from 'vitest';

import { resolveTemplate, resolveTemplatesDeep } from '../template-resolver';

describe('resolveTemplate', () => {
  it('resolves a simple path', () => {
    expect(resolveTemplate('Hello {{trigger.name}}', { trigger: { name: 'Alice' } })).toBe('Hello Alice');
  });

  it('resolves multiple placeholders in one string', () => {
    const context = { trigger: { first: 'A', last: 'B' } };
    expect(resolveTemplate('{{trigger.first}} {{trigger.last}}', context)).toBe('A B');
  });

  it('stringifies a non-string resolved value', () => {
    expect(resolveTemplate('Count: {{node1.count}}', { node1: { count: 5 } })).toBe('Count: 5');
  });

  it('resolves a missing path to an empty string rather than throwing', () => {
    expect(resolveTemplate('{{missing.path}}', {})).toBe('');
  });

  it('returns non-string values unchanged', () => {
    expect(resolveTemplate(42, {})).toBe(42);
    expect(resolveTemplate(null, {})).toBe(null);
  });
});

describe('resolveTemplatesDeep', () => {
  it('resolves templates inside a nested object', () => {
    const result = resolveTemplatesDeep(
      { message: 'Hi {{trigger.name}}', meta: { count: '{{node1.count}}' } },
      { trigger: { name: 'Bob' }, node1: { count: 3 } },
    );
    expect(result).toEqual({ message: 'Hi Bob', meta: { count: '3' } });
  });

  it('resolves templates inside array items', () => {
    const result = resolveTemplatesDeep(['{{a.b}}', 'static'], { a: { b: 'resolved' } });
    expect(result).toEqual(['resolved', 'static']);
  });
});
