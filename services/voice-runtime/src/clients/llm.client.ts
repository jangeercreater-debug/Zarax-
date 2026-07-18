import { Inject, Injectable } from '@nestjs/common';
import { ResilientHttpClient } from '@zarax/resilience';
import { APP_CONFIG, type AppConfigService } from '@zarax/shared-config';
import { AppError, ExternalServiceError } from '@zarax/shared-errors';
import { ZARAX_LOGGER, type ZaraxLogger } from '@zarax/shared-logger';

import type { VoiceRuntimeEnv } from '../config/env.schema';

export interface TurnResult {
  response: string;
  shouldEndCall: boolean;
  endCallReason?: string;
}

@Injectable()
export class LlmClient {
  private readonly httpClient: ResilientHttpClient;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfigService<VoiceRuntimeEnv>,
    @Inject(ZARAX_LOGGER) logger: ZaraxLogger,
  ) {
    this.httpClient = new ResilientHttpClient({
      providerName: 'llm-orchestrator',
      timeoutMs: 30_000,
      retry: { maxAttempts: 1, baseDelayMs: 200 },
      circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 20_000 },
      logger,
    });
  }

  async submitTurn(
    callId: string,
    agentId: string,
    tenantId: string,
    text: string,
  ): Promise<TurnResult> {
    const baseUrl = this.config.get('LLM_ORCHESTRATOR_URL');
    // Fresh callId per turn for voice (stateless per-utterance, no conversation
    // history across turns — the orchestrator maintains that via its own Redis state).
    const conversationId = callId;

    try {
      const response = await this.httpClient.fetch(
        `${baseUrl}/conversations/${conversationId}/turns`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Service-Account-Token': this.config.get('LLM_ORCHESTRATOR_SERVICE_ACCOUNT_TOKEN'),
          },
          body: JSON.stringify({ text, agentId, tenantId }),
        },
      );
      if (!response.ok) throw new ExternalServiceError('llm-orchestrator', `HTTP ${response.status}`);
      return (await response.json()) as TurnResult;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new ExternalServiceError('llm-orchestrator', error instanceof Error ? error.message : 'LLM turn failed');
    }
  }
}
