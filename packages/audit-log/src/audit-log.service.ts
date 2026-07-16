import { Inject, Injectable } from '@nestjs/common';
import { AuditLogRepository, PRISMA_CLIENT, type PrismaClient } from '@zarax/database';
import { getCorrelationId } from '@zarax/shared-logger';
import type { Principal, TenantId } from '@zarax/shared-types';

export interface RecordAuditEventParams {
  principal: Principal;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

@Injectable()
export class AuditLogService {
  private readonly repository: AuditLogRepository;

  constructor(@Inject(PRISMA_CLIENT) prisma: PrismaClient) {
    this.repository = new AuditLogRepository(prisma);
  }

  async record(params: RecordAuditEventParams): Promise<void> {
    await this.repository.record({
      tenantId: params.principal.tenantId,
      actorId: params.principal.id,
      actorType: params.principal.type,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      metadata: params.metadata,
      ipAddress: params.ipAddress,
      correlationId: getCorrelationId(),
    });
  }

  /** For system-initiated actions with no authenticated Principal (e.g. a scheduled
   * job) — actorType is always 'system' here, never spoofable as 'user'/etc. */
  async recordSystemEvent(params: {
    tenantId: TenantId;
    action: string;
    resourceType?: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.repository.record({
      tenantId: params.tenantId,
      actorId: 'system',
      actorType: 'system',
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      metadata: params.metadata,
      correlationId: getCorrelationId(),
    });
  }
}
