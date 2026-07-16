import { Inject, Injectable } from '@nestjs/common';
import { ResilientHttpClient } from '@zarax/resilience';
import { APP_CONFIG, type AppConfigService } from '@zarax/shared-config';
import { AppError, ExternalServiceError } from '@zarax/shared-errors';
import { ZARAX_LOGGER, type ZaraxLogger } from '@zarax/shared-logger';

import type { LlmOrchestratorEnv } from '../config/env.schema';

export interface RagSearchResult {
  text: string;
  score: number;
  metadata: Record<string, unknown>;
}

@Injectable()
export class RagClient {
  private readonly httpClient: ResilientHttpClient;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfigService<LlmOrchestratorEnv>,
    @Inject(ZARAX_LOGGER) logger: ZaraxLogger,
  ) {
    this.httpClient = new ResilientHttpClient({
      providerName: 'rag-service',
      timeoutMs: 5000,
      retry: { maxAttempts: 2, baseDelayMs: 200 },
      circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 20_000 },
      logger,
    });
  }

  get resilientClient(): ResilientHttpClient {
    return this.httpClient;
  }

  async search(query: string, limit = 5): Promise<RagSearchResult[]> {
    const baseUrl = this.config.get('RAG_SERVICE_URL');
    if (!baseUrl) return []; // RAG is an optional enhancement, not a hard dependency.

    try {
      const response = await this.httpClient.fetch(`${baseUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Account-Token': this.config.get('RAG_SERVICE_ACCOUNT_TOKEN'),
        },
        body: JSON.stringify({ query, limit }),
      });

      if (!response.ok) {
        throw new ExternalServiceError('rag-service', `HTTP ${response.status}`);
      }

      const body = (await response.json()) as { results: RagSearchResult[] };
      return body.results;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new ExternalServiceError(
        'rag-service',
        error instanceof Error ? error.message : 'RAG search failed',
      );
    }
  }
}
