import { Inject, Injectable } from '@nestjs/common';
import { ResilientHttpClient } from '@zarax/resilience';
import { APP_CONFIG, type AppConfigService } from '@zarax/shared-config';
import { AppError, ExternalServiceError } from '@zarax/shared-errors';
import { ZARAX_LOGGER, type ZaraxLogger } from '@zarax/shared-logger';

import type { WorkflowEngineEnv } from '../config/env.schema';

export interface RagSearchResult {
  results: Array<{ text: string; score: number; metadata: Record<string, unknown> }>;
}

/** Same shape as llm-orchestrator's own RagClient — the Knowledge Base node calls
 * rag-service's existing /search endpoint directly, reusing its full chunking/
 * embedding/retrieval pipeline rather than reimplementing any part of it. */
@Injectable()
export class RagSearchClient {
  private readonly httpClient: ResilientHttpClient;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfigService<WorkflowEngineEnv>,
    @Inject(ZARAX_LOGGER) logger: ZaraxLogger,
  ) {
    this.httpClient = new ResilientHttpClient({
      providerName: 'rag-service',
      timeoutMs: 10_000,
      retry: { maxAttempts: 2, baseDelayMs: 300, maxDelayMs: 2000 },
      circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 20_000 },
      logger,
    });
  }

  async search(query: string, limit = 5): Promise<RagSearchResult> {
    const baseUrl = this.config.get('RAG_SERVICE_URL');

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

      return (await response.json()) as RagSearchResult;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new ExternalServiceError(
        'rag-service',
        error instanceof Error ? error.message : 'Knowledge Base node search failed',
      );
    }
  }
}
