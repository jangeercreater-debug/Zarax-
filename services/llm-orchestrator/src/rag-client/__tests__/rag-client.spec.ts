import { AppConfigService } from '@zarax/shared-config';
import { ExternalServiceError } from '@zarax/shared-errors';
import type { ZaraxLogger } from '@zarax/shared-logger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LlmOrchestratorEnv } from '../../config/env.schema';
import { RagClient } from '../rag-client';

const noopLogger = { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), verbose: vi.fn() } as unknown as ZaraxLogger;

function buildConfig(overrides: Partial<LlmOrchestratorEnv> = {}): AppConfigService<LlmOrchestratorEnv> {
  return new AppConfigService({
    RAG_SERVICE_URL: 'https://rag.internal',
    RAG_SERVICE_ACCOUNT_TOKEN: 'service-token',
    ...overrides,
  } as LlmOrchestratorEnv);
}

describe('RagClient', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns an empty array when RAG_SERVICE_URL is not configured, without calling fetch', async () => {
    const client = new RagClient(buildConfig({ RAG_SERVICE_URL: '' }), noopLogger);
    const results = await client.search('tenant-1', 'refund policy');

    expect(results).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns search results on success', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ text: 'Refunds take 5-7 days.', score: 0.9, metadata: {} }] }),
    });

    const client = new RagClient(buildConfig(), noopLogger);
    const results = await client.search('tenant-1', 'refund policy', 3);

    expect(results).toEqual([{ text: 'Refunds take 5-7 days.', score: 0.9, metadata: {} }]);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://rag.internal/search');
    const headers = init.headers as Headers;
    expect(headers.get('X-Service-Account-Token')).toBe('service-token');

    const body = JSON.parse(init.body as string) as { tenantId: string };
    expect(body.tenantId).toBe('tenant-1'); // required now that rag-service validates it for service_account callers
  });

  it('throws ExternalServiceError on a non-OK response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    const client = new RagClient(buildConfig(), noopLogger);
    await expect(client.search('tenant-1', 'x')).rejects.toThrow(ExternalServiceError);
  });
});
