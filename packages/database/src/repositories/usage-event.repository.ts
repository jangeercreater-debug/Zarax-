import type { PrismaClient } from '@prisma/client';
import type { TenantId } from '@zarax/shared-types';

export interface RecordUsageEventInput {
  tenantId: TenantId;
  category: 'llm' | 'stt' | 'tts' | 'rag_embedding';
  provider: string;
  callId?: string;
  quantity: number;
  unit: 'tokens' | 'seconds' | 'characters' | 'calls';
  costUsd: number;
  metadata?: Record<string, unknown>;
}

export interface UsageSummary {
  category: string;
  provider: string;
  unit: string;
  totalQuantity: number;
  totalCostUsd: number;
  eventCount: number;
}

export class UsageEventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async record(input: RecordUsageEventInput): Promise<void> {
    await this.prisma.usageEvent.create({
      data: {
        tenantId: input.tenantId,
        category: input.category,
        provider: input.provider,
        callId: input.callId,
        quantity: input.quantity,
        unit: input.unit,
        costUsd: input.costUsd,
        metadata: (input.metadata ?? {}) as never,
      },
    });
  }

  /** Aggregated usage/cost for a tenant over a date range, grouped by
   * category+provider+unit — the shape a billing/usage-dashboard view needs. */
  async summarizeForTenant(
    tenantId: TenantId,
    range: { from: Date; to: Date },
  ): Promise<UsageSummary[]> {
    const grouped = await this.prisma.usageEvent.groupBy({
      by: ['category', 'provider', 'unit'],
      where: { tenantId, occurredAt: { gte: range.from, lte: range.to } },
      _sum: { quantity: true, costUsd: true },
      _count: { _all: true },
    });

    return grouped.map((g) => ({
      category: g.category,
      provider: g.provider,
      unit: g.unit,
      totalQuantity: g._sum.quantity ?? 0,
      totalCostUsd: g._sum.costUsd ?? 0,
      eventCount: g._count._all,
    }));
  }
}
