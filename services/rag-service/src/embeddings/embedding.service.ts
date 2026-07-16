import { Inject, Injectable } from '@nestjs/common';
import { ResilientClient } from '@zarax/resilience';
import { APP_CONFIG, type AppConfigService } from '@zarax/shared-config';
import { ExternalServiceError } from '@zarax/shared-errors';
import { ZARAX_LOGGER, type ZaraxLogger } from '@zarax/shared-logger';
import OpenAI from 'openai';

import type { RagServiceEnv } from '../config/env.schema';

const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

@Injectable()
export class EmbeddingService {
  private readonly client: OpenAI;
  public readonly resilientClient: ResilientClient;

  constructor(
    @Inject(APP_CONFIG) config: AppConfigService<RagServiceEnv>,
    @Inject(ZARAX_LOGGER) logger: ZaraxLogger,
  ) {
    this.client = new OpenAI({ apiKey: config.get('OPENAI_API_KEY') });
    this.resilientClient = new ResilientClient({
      providerName: 'openai-embeddings',
      timeoutMs: 15_000,
      retry: { maxAttempts: 3, baseDelayMs: 300, maxDelayMs: 3000 },
      circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30_000 },
      rateLimiter: { capacity: 100, refillPerSecond: 20 },
      logger,
    });
  }

  /** Embeds a batch of texts in one API call — always prefer this over calling
   * `embedOne` in a loop, since batching is both cheaper and faster. */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    return this.resilientClient.execute(async () => {
      try {
        const response = await this.client.embeddings.create({
          model: DEFAULT_EMBEDDING_MODEL,
          input: texts,
        });
        return response.data
          .sort((a, b) => a.index - b.index)
          .map((item) => item.embedding);
      } catch (error) {
        throw new ExternalServiceError(
          'OpenAI',
          error instanceof Error ? error.message : 'Embedding request failed',
        );
      }
    }, 'OpenAI.embeddings.create');
  }

  async embedOne(text: string): Promise<number[]> {
    const [embedding] = await this.embedBatch([text]);
    return embedding;
  }

  /** text-embedding-3-small's native output dimensionality — used to size the Qdrant
   * collection when it's first created. */
  getVectorSize(): number {
    return 1536;
  }
}
