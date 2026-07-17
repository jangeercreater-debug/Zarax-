import { ValidationError } from '@zarax/shared-errors';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HttpNodeExecutor } from '../http.executor';

const fakeLogger = { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };

describe('HttpNodeExecutor', () => {
  const executor = new HttpNodeExecutor(fakeLogger as never);
  const baseContext = { tenantId: 't1', executionId: 'e1', context: { trigger: { userId: 'u1' } } };

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves a templated URL before calling fetch', async () => {
    const node = { id: 'n1', type: 'http_request', data: { url: 'https://example.com/users/{{trigger.userId}}', method: 'GET' } };
    await executor.execute(node, baseContext);

    expect(fetch).toHaveBeenCalledWith('https://example.com/users/u1', expect.anything());
  });

  it('defaults webhook nodes to POST', async () => {
    const node = { id: 'n1', type: 'webhook', data: { url: 'https://example.com/hook' } };
    await executor.execute(node, baseContext);

    expect(fetch).toHaveBeenCalledWith('https://example.com/hook', expect.objectContaining({ method: 'POST' }));
  });

  it('rejects a node with no URL', async () => {
    const node = { id: 'n1', type: 'http_request', data: {} };
    await expect(executor.execute(node, baseContext)).rejects.toThrow(ValidationError);
  });

  it('rejects an unsupported HTTP method', async () => {
    const node = { id: 'n1', type: 'http_request', data: { url: 'https://example.com', method: 'TRACE' } };
    await expect(executor.execute(node, baseContext)).rejects.toThrow(ValidationError);
  });

  it('returns the parsed JSON response body for later nodes to reference', async () => {
    const node = { id: 'n1', type: 'http_request', data: { url: 'https://example.com', method: 'GET' } };
    const result = await executor.execute(node, baseContext);

    expect(result.output).toEqual({ statusCode: 200, ok: true, body: { ok: true } });
  });
});
