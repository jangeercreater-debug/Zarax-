import { Inject, Injectable } from '@nestjs/common';
import { ResilientHttpClient } from '@zarax/resilience';
import { APP_CONFIG, type AppConfigService } from '@zarax/shared-config';
import { ExternalServiceError } from '@zarax/shared-errors';
import { ZARAX_LOGGER, type ZaraxLogger } from '@zarax/shared-logger';

import type { VoiceRuntimeEnv } from '../config/env.schema';

export interface AgentConfig {
  systemPrompt?: string;
  welcomeMessage?: string;
  voiceId?: string;
  sttModel?: string;
  provider?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  ragEnabled?: boolean;
}

@Injectable()
export class AgentConfigClient {
  private readonly httpClient: ResilientHttpClient;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfigService<VoiceRuntimeEnv>,
    @Inject(ZARAX_LOGGER) logger: ZaraxLogger,
  ) {
    this.httpClient = new ResilientHttpClient({
      providerName: 'services-api-internal',
      timeoutMs: 5_000,
      retry: { maxAttempts: 3, baseDelayMs: 300, maxDelayMs: 2000 },
      circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 20_000 },
      logger,
    });
  }

  async getAgentConfig(agentId: string): Promise<AgentConfig> {
    const baseUrl = this.config.get('API_SERVICE_URL');
    const response = await this.httpClient.fetch(`${baseUrl}/internal/agents/${agentId}/config`, {
      headers: { 'X-Internal-Token': this.config.get('API_INTERNAL_SERVICE_TOKEN') },
    });
    if (!response.ok) {
      throw new ExternalServiceError('services-api', `Could not fetch agent config: HTTP ${response.status}`);
    }
    const body = (await response.json()) as { config: AgentConfig };
    return body.config;
  }
}
