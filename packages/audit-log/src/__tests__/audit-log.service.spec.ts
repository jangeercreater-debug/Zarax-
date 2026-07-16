import { asTenantId, asUserId } from '@zarax/shared-types';
import { describe, expect, it, vi } from 'vitest';

import { AuditLogService } from '../audit-log.service';

function buildFakePrisma() {
  return { auditLogEntry: { create: vi.fn().mockResolvedValue({}) } };
}

describe('AuditLogService', () => {
  it('records an audit event with the principal as actor', async () => {
    const prisma = buildFakePrisma();
    const service = new AuditLogService(prisma as never);

    await service.record({
      principal: {
        type: 'user',
        id: asUserId('user-1'),
        tenantId: asTenantId('tenant-1'),
        email: 'a@b.com',
        roles: ['owner'],
        permissions: ['*'],
      },
      action: 'auth.login',
      ipAddress: '1.2.3.4',
    });

    expect(prisma.auditLogEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          actorId: 'user-1',
          actorType: 'user',
          action: 'auth.login',
          ipAddress: '1.2.3.4',
        }),
      }),
    );
  });

  it('records a system event with actorType always system', async () => {
    const prisma = buildFakePrisma();
    const service = new AuditLogService(prisma as never);

    await service.recordSystemEvent({
      tenantId: asTenantId('tenant-1'),
      action: 'workflow.scheduled_trigger',
    });

    expect(prisma.auditLogEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actorId: 'system', actorType: 'system' }),
      }),
    );
  });
});
