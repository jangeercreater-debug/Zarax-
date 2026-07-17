import { Inject, Injectable } from '@nestjs/common';
import { ResilientHttpClient } from '@zarax/resilience';
import { APP_CONFIG, type AppConfigService } from '@zarax/shared-config';
import { AppError, ExternalServiceError } from '@zarax/shared-errors';
import { ZARAX_LOGGER, type ZaraxLogger } from '@zarax/shared-logger';

import type { ApiEnv } from '../../../config/env.schema';

export interface ToolCatalogEntry {
  name: string;
  description: string;
}

@Injectable()
export class ToolCatalogClient {
  private readonly httpClient: ResilientHttpClient;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfigService<ApiEnv>,
    @Inject(ZARAX_LOGGER) logger: ZaraxLogger,
  ) {
    this.httpClient = new ResilientHttpClient({
      providerName: 'tool-executor',
      timeoutMs: 5000,
      retry: { maxAttempts: 2, baseDelayMs: 200 },
      circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 20_000 },
      logger,
    });
  }

  async listTools(): Promise<ToolCatalogEntry[]> {
    const baseUrl = this.config.get('TOOL_EXECUTOR_URL');

    try {
      const response = await this.httpClient.fetch(`${baseUrl}/tools`, {
        headers: { 'X-Internal-Token': this.config.get('TOOL_EXECUTOR_INTERNAL_SERVICE_TOKEN') },
      });

      if (!response.ok) {
        throw new ExternalServiceError('tool-executor', `HTTP ${response.status}`);
      }

      return (await response.json()) as ToolCatalogEntry[];
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new ExternalServiceError(
        'tool-executor',
        error instanceof Error ? error.message : 'Failed to fetch tool catalog',
      );
    }
  }
}
