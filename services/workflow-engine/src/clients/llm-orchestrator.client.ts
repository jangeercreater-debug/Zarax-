import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { ResilientHttpClient } from '@zarax/resilience';
import { APP_CONFIG, type AppConfigService } from '@zarax/shared-config';
import { AppError, ExternalServiceError } from '@zarax/shared-errors';
import { ZARAX_LOGGER, type ZaraxLogger } from '@zarax/shared-logger';

import type { WorkflowEngineEnv } from '../config/env.schema';

export interface AgentTurnResult {
  response: string;
  shouldEndCall: boolean;
  endCallReason?: string;
}

/**
 * Same shape as services/api's LlmOrchestratorClient (used by "Test Agent") — the AI
 * Agent node reuses the exact same real conversation pipeline (tool loop, RAG,
 * metering), just from a different calling service. Each service that depends on
 * llm-orchestrator gets its own small client (matching the established
 * one-client-per-consuming-service pattern — see llm-orchestrator's own RagClient),
 * rather than a shared package for what's a handful of lines per consumer.
 */
@Injectable()
export class LlmOrchestratorClient {
  private readonly httpClient: ResilientHttpClient;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfigService<WorkflowEngineEnv>,
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

  async sendTurn(tenantId: string, agentId: string, message: string): Promise<AgentTurnResult> {
    const baseUrl = this.config.get('LLM_ORCHESTRATOR_URL');
    const callId = `workflow-${randomUUID()}`;

    try {
      const response = await this.httpClient.fetch(`${baseUrl}/conversations/${callId}/turns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Account-Token': this.config.get('LLM_ORCHESTRATOR_SERVICE_ACCOUNT_TOKEN'),
        },
        body: JSON.stringify({ text: message, agentId, tenantId }),
      });

      if (!response.ok) {
        throw new ExternalServiceError('llm-orchestrator', `HTTP ${response.status}`);
      }

      return (await response.json()) as AgentTurnResult;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new ExternalServiceError(
        'llm-orchestrator',
        error instanceof Error ? error.message : 'AI Agent node call failed',
      );
    }
  }
}
