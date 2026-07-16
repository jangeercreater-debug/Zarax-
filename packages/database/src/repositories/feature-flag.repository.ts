import type { PrismaClient } from '@prisma/client';
import type { TenantId } from '@zarax/shared-types';

export interface FeatureFlagRecord {
  key: string;
  description: string;
  defaultEnabled: boolean;
  rolloutPercentage: number;
}

export class FeatureFlagRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByKey(key: string): Promise<FeatureFlagRecord | null> {
    return this.prisma.featureFlag.findUnique({ where: { key } });
  }

  async findOverride(tenantId: TenantId, key: string): Promise<{ enabled: boolean } | null> {
    const override = await this.prisma.featureFlagOverride.findUnique({
      where: { tenantId_flagKey: { tenantId, flagKey: key } },
    });
    return override ? { enabled: override.enabled } : null;
  }

  async upsertFlag(params: {
    key: string;
    description: string;
    defaultEnabled?: boolean;
    rolloutPercentage?: number;
  }): Promise<FeatureFlagRecord> {
    return this.prisma.featureFlag.upsert({
      where: { key: params.key },
      create: {
        key: params.key,
        description: params.description,
        defaultEnabled: params.defaultEnabled ?? false,
        rolloutPercentage: params.rolloutPercentage ?? 0,
      },
      update: {
        description: params.description,
        ...(params.defaultEnabled !== undefined ? { defaultEnabled: params.defaultEnabled } : {}),
        ...(params.rolloutPercentage !== undefined ? { rolloutPercentage: params.rolloutPercentage } : {}),
      },
    });
  }

  async setOverride(tenantId: TenantId, key: string, enabled: boolean): Promise<void> {
    await this.prisma.featureFlagOverride.upsert({
      where: { tenantId_flagKey: { tenantId, flagKey: key } },
      create: { tenantId, flagKey: key, enabled },
      update: { enabled },
    });
  }
}
