import { UsageEventRepository, type PrismaClient, type UsageSummary } from '@zarax/database';
import type { TenantId } from '@zarax/shared-types';

import {
  calculateEmbeddingCostUsd,
  calculateLlmCostUsd,
  calculateSttCostUsd,
  calculateTtsCostUsd,
} from './pricing/pricing-table';

export class MeteringService {
  private readonly repository: UsageEventRepository;

  constructor(prisma: PrismaClient) {
    this.repository = new UsageEventRepository(prisma);
  }

  async recordLlmUsage(params: {
    tenantId: TenantId;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    callId?: string;
  }): Promise<void> {
    const costUsd = calculateLlmCostUsd(params.provider, params.model, params.inputTokens, params.outputTokens);
    await this.repository.record({
      tenantId: params.tenantId,
      category: 'llm',
      provider: params.provider,
      callId: params.callId,
      quantity: params.inputTokens + params.outputTokens,
      unit: 'tokens',
      costUsd,
      metadata: { model: params.model, inputTokens: params.inputTokens, outputTokens: params.outputTokens },
    });
  }

  async recordSttUsage(params: {
    tenantId: TenantId;
    provider: string;
    seconds: number;
    callId?: string;
  }): Promise<void> {
    const costUsd = calculateSttCostUsd(params.provider, params.seconds);
    await this.repository.record({
      tenantId: params.tenantId,
      category: 'stt',
      provider: params.provider,
      callId: params.callId,
      quantity: params.seconds,
      unit: 'seconds',
      costUsd,
    });
  }

  async recordTtsUsage(params: {
    tenantId: TenantId;
    provider: string;
    characters: number;
    callId?: string;
  }): Promise<void> {
    const costUsd = calculateTtsCostUsd(params.provider, params.characters);
    await this.repository.record({
      tenantId: params.tenantId,
      category: 'tts',
      provider: params.provider,
      callId: params.callId,
      quantity: params.characters,
      unit: 'characters',
      costUsd,
    });
  }

  async recordRagEmbeddingUsage(params: {
    tenantId: TenantId;
    providerModelKey: string;
    tokens: number;
  }): Promise<void> {
    const costUsd = calculateEmbeddingCostUsd(params.providerModelKey, params.tokens);
    await this.repository.record({
      tenantId: params.tenantId,
      category: 'rag_embedding',
      provider: params.providerModelKey,
      quantity: params.tokens,
      unit: 'tokens',
      costUsd,
    });
  }

  async getUsageSummary(tenantId: TenantId, from: Date, to: Date): Promise<UsageSummary[]> {
    return this.repository.summarizeForTenant(tenantId, { from, to });
  }
}
