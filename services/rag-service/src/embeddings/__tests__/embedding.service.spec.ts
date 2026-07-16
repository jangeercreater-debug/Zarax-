import { AppConfigService } from '@zarax/shared-config';
import { ExternalServiceError } from '@zarax/shared-errors';
import type { ZaraxLogger } from '@zarax/shared-logger';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RagServiceEnv } from '../../config/env.schema';
import { EmbeddingService } from '../embedding.service';

const embeddingsCreateMock = vi.fn();

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    embeddings: { create: embeddingsCreateMock },
  })),
}));

function buildConfig(): AppConfigService<RagServiceEnv> {
  return new AppConfigService({ OPENAI_API_KEY: 'test-key' } as RagServiceEnv);
}

const noopLogger = {
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  verbose: vi.fn(),
} as unknown as ZaraxLogger;

describe('EmbeddingService', () => {
  beforeEach(() => {
    embeddingsCreateMock.mockReset();
  });

  it('returns embeddings sorted by index', async () => {
    embeddingsCreateMock.mockResolvedValue({
      data: [
        { index: 1, embedding: [0.4, 0.5] },
        { index: 0, embedding: [0.1, 0.2] },
      ],
    });

    const service = new EmbeddingService(buildConfig(), noopLogger);
    const result = await service.embedBatch(['first', 'second']);

    expect(result).toEqual([
      [0.1, 0.2],
      [0.4, 0.5],
    ]);
  });

  it('returns an empty array for an empty input batch without calling the API', async () => {
    const service = new EmbeddingService(buildConfig(), noopLogger);
    const result = await service.embedBatch([]);

    expect(result).toEqual([]);
    expect(embeddingsCreateMock).not.toHaveBeenCalled();
  });

  it('embedOne returns a single embedding vector', async () => {
    embeddingsCreateMock.mockResolvedValue({ data: [{ index: 0, embedding: [0.9, 0.8] }] });

    const service = new EmbeddingService(buildConfig(), noopLogger);
    const result = await service.embedOne('hello');

    expect(result).toEqual([0.9, 0.8]);
  });

  it('throws ExternalServiceError when the OpenAI call fails', async () => {
    embeddingsCreateMock.mockRejectedValue(new Error('rate limited upstream'));

    const service = new EmbeddingService(buildConfig(), noopLogger);
    await expect(service.embedBatch(['x'])).rejects.toThrow(ExternalServiceError);
  });
});
