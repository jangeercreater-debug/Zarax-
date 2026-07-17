import { UnauthenticatedError } from '@zarax/shared-errors';
import { asTenantId, asUserId, type UserPrincipal } from '@zarax/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('argon2', () => ({
  hash: vi.fn(async (value: string) => `hashed:${value}`),
  verify: vi.fn(async (hash: string, plain: string) => hash === `hashed:${plain}`),
}));

import { UsersService } from '../users.service';

function buildPrincipal(sessionId = 'session-current'): UserPrincipal {
  return {
    type: 'user',
    id: asUserId('user-1'),
    tenantId: asTenantId('tenant-1'),
    email: 'a@b.com',
    roles: ['owner'],
    permissions: ['*'],
    sessionId,
  };
}

describe('UsersService', () => {
  let userRepository: { findByIdOrThrow: ReturnType<typeof vi.fn>; updatePassword: ReturnType<typeof vi.fn>; listMemberships: ReturnType<typeof vi.fn> };
  let auditLogService: { record: ReturnType<typeof vi.fn> };
  let prisma: { userSession: Record<string, ReturnType<typeof vi.fn>> };
  let service: UsersService;

  beforeEach(() => {
    userRepository = {
      findByIdOrThrow: vi.fn().mockResolvedValue({ id: 'user-1', passwordHash: 'hashed:old-password' }),
      updatePassword: vi.fn(),
      listMemberships: vi.fn(),
    };
    auditLogService = { record: vi.fn() };
    prisma = {
      userSession: {
        updateMany: vi.fn(),
        findMany: vi.fn(),
      },
    };
    service = new UsersService(userRepository as never, auditLogService as never, prisma as never);
  });

  it('changePassword rejects an incorrect current password', async () => {
    await expect(
      service.changePassword(buildPrincipal(), { currentPassword: 'wrong', newPassword: 'newpassword123' }),
    ).rejects.toThrow(UnauthenticatedError);
  });

  it('changePassword updates the password and revokes every OTHER session, keeping the current one', async () => {
    await service.changePassword(buildPrincipal('session-current'), {
      currentPassword: 'old-password',
      newPassword: 'newpassword123',
    });

    expect(userRepository.updatePassword).toHaveBeenCalledWith('user-1', 'hashed:newpassword123');
    expect(prisma.userSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1', id: { not: 'session-current' } }),
      }),
    );
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.password_changed' }),
    );
  });
});
