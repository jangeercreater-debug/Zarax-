import { Inject, Injectable } from '@nestjs/common';
import type { ToolDefinition } from '@zarax/ai-sdk';
import { ResilientHttpClient } from '@zarax/resilience';
import { APP_CONFIG, type AppConfigService } from '@zarax/shared-config';
import { AppError, ExternalServiceError } from '@zarax/shared-errors';
import { ZARAX_LOGGER, type ZaraxLogger } from '@zarax/shared-logger';

import type { LlmOrchestratorEnv } from '../config/env.schema';

interface ToolCatalogEntry {
  name: string;
  description: string;
  parameters: ToolDefinition['parameters'];
}

const CACHE_TTL_MS = 60_000;

@Injectable()
export class ToolCatalogClient {
  private readonly httpClient: ResilientHttpClient;
  private cache?: { tools: ToolDefinition[]; fetchedAt: number };

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfigService<LlmOrchestratorEnv>,
    @Inject(ZARAX_LOGGER) logger: ZaraxLogger,
  ) {
    this.httpClient = new ResilientHttpClient({
      providerName: 'tool-executor-catalog',
      timeoutMs: 3000,
      retry: { maxAttempts: 2, baseDelayMs: 150 },
      circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 20_000 },
      logger,
    });
  }

  async getAvailableTools(): Promise<ToolDefinition[]> {
    if (this.cache && Date.now() - this.cache.fetchedAt < CACHE_TTL_MS) {
      return this.cache.tools;
    }

    const baseUrl = this.config.get('TOOL_EXECUTOR_URL');
    try {
      const response = await this.httpClient.fetch(`${baseUrl}/tools`, {
        headers: { 'X-Internal-Token': this.config.get('TOOL_EXECUTOR_INTERNAL_SERVICE_TOKEN') },
      });

      if (!response.ok) {
        throw new ExternalServiceError('tool-executor', `HTTP ${response.status}`);
      }

      const entries = (await response.json()) as ToolCatalogEntry[];
      const tools: ToolDefinition[] = entries.map((entry) => ({
        name: entry.name,
        description: entry.description,
        parameters: entry.parameters,
      }));

      this.cache = { tools, fetchedAt: Date.now() };
      return tools;
    } catch (error) {
      // A stale cached catalog is far better than failing the whole conversation turn
      // over a transient tool-executor blip — only bubble up if we have nothing at all.
      if (this.cache) return this.cache.tools;
      if (error instanceof AppError) throw error;
      throw new ExternalServiceError(
        'tool-executor',
        error instanceof Error ? error.message : 'Failed to fetch tool catalog',
      );
    }
  }
}
