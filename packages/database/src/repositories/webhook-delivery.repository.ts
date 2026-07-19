import type { PrismaClient } from '@prisma/client';
import type { TenantId } from '@zarax/shared-types';

export interface WebhookDeliveryRecord {
  id: string;
  tenantId: string;
  url: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'delivered' | 'failed' | 'dead_letter';
  attempts: number;
}

export class WebhookDeliveryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(params: {
    tenantId: TenantId;
    url: string;
    payload: Record<string, unknown>;
  }): Promise<WebhookDeliveryRecord> {
    const record = await this.prisma.webhookDelivery.create({
      data: { tenantId: params.tenantId, url: params.url, payload: params.payload as never },
    });
    return record as unknown as WebhookDeliveryRecord;
  }

  async markDelivered(id: string): Promise<void> {
    await this.prisma.webhookDelivery.update({
      where: { id },
      data: { status: 'delivered', deliveredAt: new Date(), attempts: { increment: 1 } },
    });
  }

  async markFailedAttempt(id: string, error: string): Promise<void> {
    await this.prisma.webhookDelivery.update({
      where: { id },
      data: { status: 'failed', lastError: error, attempts: { increment: 1 } },
    });
  }

  async markDeadLetter(id: string, error: string): Promise<void> {
    await this.prisma.webhookDelivery.update({
      where: { id },
      data: { status: 'dead_letter', lastError: error },
    });
  }

  async listForTenant(
    tenantId: TenantId,
    options: { status?: string; limit?: number } = {},
  ): Promise<WebhookDeliveryRecord[]> {
    const records = await this.prisma.webhookDelivery.findMany({
      where: { tenantId, ...(options.status ? { status: options.status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: options.limit ?? 50,
    });
    return records as unknown as WebhookDeliveryRecord[];
  }
}
