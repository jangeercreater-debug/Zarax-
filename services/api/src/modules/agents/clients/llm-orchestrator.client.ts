import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { ResilientHttpClient } from '@zarax/resilience';
import { APP_CONFIG, type AppConfigService } from '@zarax/shared-config';
import { AppError, ExternalServiceError } from '@zarax/shared-errors';
import { ZARAX_LOGGER, type ZaraxLogger } from '@zarax/shared-logger';

import type { ApiEnv } from '../../../config/env.schema';

export interface TestTurnResult {
  response: string;
  shouldEndCall: boolean;
  endCallReason?: string;
}

@Injectable()
export class LlmOrchestratorClient {
  private readonly httpClient: ResilientHttpClient;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfigService<ApiEnv>,
    @Inject(ZARAX_LOGGER) logger: ZaraxLogger,
  ) {
    this.httpClient = new ResilientHttpClient({
      providerName: 'llm-orchestrator',
      timeoutMs: 30_000, // a full tool-calling loop can take longer than a typical HTTP call
      retry: { maxAttempts: 1, baseDelayMs: 200 }, // a test turn isn't idempotent-safe to retry blindly (it's a real LLM call)
      circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 20_000 },
      logger,
    });
  }

  /**
   * Sends one message through the *real* conversation pipeline for a "Test Agent"
   * dry run — same endpoint a live call uses, so tool-calling, RAG augmentation, and
   * usage/cost metering all apply exactly as they would in production. Each call uses
   * a fresh, random callId, so there's no conversation history to seed or clean up —
   * llm-orchestrator's ConversationStateService naturally treats an unseen callId as
   * a brand-new conversation.
   */
  async testTurn(tenantId: string, agentId: string, message: string): Promise<TestTurnResult> {
    const baseUrl = this.config.get('LLM_ORCHESTRATOR_URL');
    const testCallId = `test-${randomUUID()}`;

    try {
      const response = await this.httpClient.fetch(`${baseUrl}/conversations/${testCallId}/turns`, {
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

      return (await response.json()) as TestTurnResult;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new ExternalServiceError(
        'llm-orchestrator',
        error instanceof Error ? error.message : 'Test turn failed',
      );
    }
  }
}
