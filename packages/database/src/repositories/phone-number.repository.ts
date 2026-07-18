import type { PrismaClient } from '@prisma/client';
import { NotFoundError } from '@zarax/shared-errors';
import type { TenantId } from '@zarax/shared-types';

export interface PhoneNumberRecord {
  id: string;
  tenantId: string;
  phoneNumber: string;
  agentId: string | null;
  sipTrunkId: string | null;
  friendlyName: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export class PhoneNumberRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listForTenant(tenantId: TenantId): Promise<PhoneNumberRecord[]> {
    const rows = await this.prisma.phoneNumber.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(this.toRecord);
  }

  async findById(tenantId: TenantId, id: string): Promise<PhoneNumberRecord> {
    const row = await this.prisma.phoneNumber.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundError('PhoneNumber', id);
    return this.toRecord(row);
  }

  async create(params: {
    tenantId: TenantId;
    phoneNumber: string;
    friendlyName?: string;
    sipTrunkId?: string;
  }): Promise<PhoneNumberRecord> {
    const row = await this.prisma.phoneNumber.create({
      data: { tenantId: params.tenantId, phoneNumber: params.phoneNumber, friendlyName: params.friendlyName, sipTrunkId: params.sipTrunkId },
    });
    return this.toRecord(row);
  }

  async assignAgent(tenantId: TenantId, id: string, agentId: string | null): Promise<PhoneNumberRecord> {
    const result = await this.prisma.phoneNumber.updateMany({ where: { id, tenantId }, data: { agentId } });
    if (result.count === 0) throw new NotFoundError('PhoneNumber', id);
    return this.findById(tenantId, id);
  }

  async delete(tenantId: TenantId, id: string): Promise<void> {
    const result = await this.prisma.phoneNumber.deleteMany({ where: { id, tenantId } });
    if (result.count === 0) throw new NotFoundError('PhoneNumber', id);
  }

  private toRecord(row: { id: string; tenantId: string; phoneNumber: string; agentId: string | null; sipTrunkId: string | null; friendlyName: string | null; status: string; createdAt: Date; updatedAt: Date }): PhoneNumberRecord {
    return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
  }
}
