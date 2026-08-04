import type { PrismaClient } from '@prisma/client';
import type { TenantId } from '@zarax/shared-types';

export interface CallRecord {
  id: string;
  tenantId: string;
  agentId: string;
  channel: string;
  direction: string;
  fromNumber: string | null;
  toNumber: string | null;
  roomName: string | null;
  sipCallId: string | null;
  recordingUrl: string | null;
  startedAt: string;
  endedAt: string | null;
  endReason: string | null;
  durationMs: number | null;
  llmProvider: string | null;
  turnCount: number;
}

export class CallRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(params: {
    tenantId: TenantId;
    agentId: string;
    channel: string;
    direction?: string;
    fromNumber?: string;
    toNumber?: string;
    roomName?: string;
    sipCallId?: string;
  }): Promise<CallRecord> {
    const row = await this.prisma.call.create({
      data: {
        tenantId: params.tenantId,
        agentId: params.agentId,
        channel: params.channel as never,
        direction: params.direction ?? 'inbound',
        fromNumber: params.fromNumber,
        toNumber: params.toNumber,
        roomName: params.roomName,
        sipCallId: params.sipCallId,
        startedAt: new Date(),
      },
    });
    return this.toRecord(row);
  }

  async complete(id: string, params: { endReason?: string; durationMs?: number; llmProvider?: string; turnCount?: number; recordingUrl?: string }): Promise<void> {
    await this.prisma.call.update({
      where: { id },
      data: { endedAt: new Date(), endReason: params.endReason, durationMs: params.durationMs, llmProvider: params.llmProvider, turnCount: params.turnCount, recordingUrl: params.recordingUrl },
    });
  }

  async listForTenant(tenantId: TenantId, limit = 50): Promise<CallRecord[]> {
    const rows = await this.prisma.call.findMany({
      where: { tenantId },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
    return rows.map(this.toRecord);
  }


  async listFiltered(params: {
    tenantId: string;
    search?: string;
    agentId?: string;
    status?: 'active' | 'completed';
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: CallRecord[]; total: number; page: number; totalPages: number }> {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { tenantId: params.tenantId };
    if (params.agentId) where.agentId = params.agentId;
    if (params.status === 'active') where.endedAt = null;
    if (params.status === 'completed') where.endedAt = { not: null };
    if (params.from || params.to) {
      where.startedAt = {
        ...(params.from ? { gte: new Date(params.from) } : {}),
        ...(params.to ? { lte: new Date(params.to) } : {}),
      };
    }
    if (params.search) {
      where.OR = [
        { fromNumber: { contains: params.search, mode: 'insensitive' } },
        { toNumber: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.call.findMany({ where, orderBy: { startedAt: 'desc' }, take: limit, skip }),
      this.prisma.call.count({ where }),
    ]);

    return {
      items: rows.map(this.toRecord),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async listActive(tenantId: TenantId): Promise<CallRecord[]> {
    const rows = await this.prisma.call.findMany({
      where: { tenantId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    return rows.map(this.toRecord);
  }

  private toRecord(row: {
    id: string; tenantId: string; agentId: string; channel: string; direction: string;
    fromNumber: string | null; toNumber: string | null; roomName: string | null; sipCallId: string | null;
    recordingUrl: string | null; startedAt: Date; endedAt: Date | null; endReason: string | null;
    durationMs: number | null; llmProvider: string | null; turnCount: number;
  }): CallRecord {
    return { ...row, startedAt: row.startedAt.toISOString(), endedAt: row.endedAt?.toISOString() ?? null };
  }
}
