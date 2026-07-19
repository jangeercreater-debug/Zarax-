import type { PrismaClient, Prisma, AuditLogEntry as PrismaAuditLogEntry } from '@prisma/client';
import type { TenantId } from '@zarax/shared-types';

import { TenantScopedRepository } from './tenant-scoped.repository';

export interface AuditLogEntryInput {
  tenantId: TenantId;
  actorId: string;
  actorType: 'user' | 'service_account' | 'api_key' | 'system';
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  correlationId?: string;
}

export class AuditLogRepository extends TenantScopedRepository<
  PrismaAuditLogEntry,
  Prisma.AuditLogEntryWhereInput
> {
  constructor(private readonly prisma: PrismaClient) {
    super(prisma.auditLogEntry);
  }

  /** Audit rows are append-only — there is deliberately no update/delete method here. */
  async record(entry: AuditLogEntryInput): Promise<void> {
    await this.prisma.auditLogEntry.create({
      data: {
        tenantId: entry.tenantId,
        actorId: entry.actorId,
        actorType: entry.actorType,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        metadata: (entry.metadata ?? {}) as never,
        ipAddress: entry.ipAddress,
        correlationId: entry.correlationId,
      },
    });
  }

  async listForTenant(
    tenantId: TenantId,
    options: { action?: string; limit?: number } = {},
  ): Promise<PrismaAuditLogEntry[]> {
    return this.prisma.auditLogEntry.findMany({
      where: { tenantId, ...(options.action ? { action: options.action } : {}) },
      orderBy: { createdAt: 'desc' },
      take: options.limit ?? 50,
    });
  }
}
