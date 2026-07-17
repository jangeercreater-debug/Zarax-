import { createHash } from 'node:crypto';

import { ForbiddenError, UnauthenticatedError, ValidationError } from '@zarax/shared-errors';
import { asTenantId, asUserId, type UserPrincipal } from '@zarax/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../auth.service';

vi.mock('argon2', () => ({
  hash: vi.fn(async (value: string) => `hashed:${value}`),
  verify: vi.fn(async (hash: string, plain: string) => hash === `hashed:${plain}`),
}));

function buildDeps() {
  const userRepository = {
    findByEmail: vi.fn(),
    findByIdOrThrow: vi.fn(),
    create: vi.fn(),
    createMembership: vi.fn(),
    findMembership: vi.fn(),
  };
  const tenantRepository = { findBySlug: vi.fn(), create: vi.fn() };
  const jwtTokenService = {
    signAccessToken: vi.fn(() => 'access-token'),
    signRefreshToken: vi.fn(() => 'refresh-token'),
    verifyRefreshToken: vi.fn(),
  };
  const auditLogService = { record: vi.fn() };
  const authEmailService = {
    sendVerificationEmail: vi.fn(() => 'https://dashboard/verify-email?token=abc'),
    sendPasswordResetEmail: vi.fn(() => 'https://dashboard/reset-password?token=xyz'),
  };
  const prisma = {
    tenantMembership: { findFirst: vi.fn() },
    userSession: {
      create: vi.fn(async ({ data }: { data: { id?: string } }) => ({ id: data.id ?? 'session-generated' })),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    passwordResetToken: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    emailVerificationToken: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  };

  return { userRepository, tenantRepository, jwtTokenService, auditLogService, authEmailService, prisma };
}

function buildService(deps: ReturnType<typeof buildDeps>) {
  return new AuthService(
    deps.userRepository as never,
    deps.tenantRepository as never,
    deps.jwtTokenService as never,
    deps.auditLogService as never,
    deps.authEmailService as never,
    deps.prisma as never,
  );
}

describe('AuthService', () => {
  let deps: ReturnType<typeof buildDeps>;

  beforeEach(() => {
    deps = buildDeps();
  });

  it('signup creates a session and sends a verification email', async () => {
    deps.tenantRepository.findBySlug.mockResolvedValue(null);
    deps.tenantRepository.create.mockResolvedValue({ id: 'tenant-1' });
    deps.userRepository.create.mockResolvedValue({ id: 'user-1', email: 'a@b.com' });

    const service = buildService(deps);
    const tokens = await service.signup(
      { email: 'a@b.com', password: 'password123', fullName: 'A', tenantName: 'T', tenantSlug: 't' },
      {},
    );

    expect(tokens.accessToken).toBe('access-token');
    expect(deps.authEmailService.sendVerificationEmail).toHaveBeenCalledWith('a@b.com', expect.any(String));
    expect(deps.prisma.userSession.create).toHaveBeenCalled();
  });

  it('refresh rejects a token with no sessionId (pre-session-tracking format)', async () => {
    deps.jwtTokenService.verifyRefreshToken.mockReturnValue({ sub: 'user-1', tenantId: 'tenant-1', type: 'refresh' });

    const service = buildService(deps);
    await expect(service.refresh('old-token', {})).rejects.toThrow(UnauthenticatedError);
  });

  it('refresh rotates the session and returns new tokens on success', async () => {
    deps.jwtTokenService.verifyRefreshToken.mockReturnValue({
      sub: 'user-1',
      tenantId: 'tenant-1',
      type: 'refresh',
      sessionId: 'session-1',
    });
    deps.userRepository.findByIdOrThrow.mockResolvedValue({ id: 'user-1', email: 'a@b.com' });
    deps.prisma.tenantMembership.findFirst.mockResolvedValue({ tenantId: 'tenant-1', role: 'OWNER' });
    deps.prisma.userSession.findUnique.mockResolvedValue({
      id: 'session-1',
      revokedAt: null,
      refreshTokenHash: createHash('sha256').update('presented-token').digest('hex'),
    });

    const service = buildService(deps);
    const tokens = await service.refresh('presented-token', {});

    expect(tokens.accessToken).toBe('access-token');
    expect(deps.prisma.userSession.update).toHaveBeenCalled();
  });

  it('refresh fails when the session was revoked', async () => {
    deps.jwtTokenService.verifyRefreshToken.mockReturnValue({
      sub: 'user-1',
      tenantId: 'tenant-1',
      type: 'refresh',
      sessionId: 'session-1',
    });
    deps.userRepository.findByIdOrThrow.mockResolvedValue({ id: 'user-1', email: 'a@b.com' });
    deps.prisma.tenantMembership.findFirst.mockResolvedValue({ tenantId: 'tenant-1', role: 'OWNER' });
    deps.prisma.userSession.findUnique.mockResolvedValue({
      id: 'session-1',
      revokedAt: new Date(),
      refreshTokenHash: 'irrelevant',
    });

    const service = buildService(deps);
    await expect(service.refresh('presented-token', {})).rejects.toThrow(UnauthenticatedError);
  });

  it('resetPassword rejects an invalid/expired token', async () => {
    deps.prisma.passwordResetToken.findUnique.mockResolvedValue(null);

    const service = buildService(deps);
    await expect(service.resetPassword('bad-token', 'newpassword123')).rejects.toThrow(ValidationError);
  });

  it('resetPassword updates the password and revokes every session', async () => {
    deps.prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const service = buildService(deps);
    await service.resetPassword('good-token', 'newpassword123');

    expect(deps.prisma.passwordResetToken.update).toHaveBeenCalled();
    expect(deps.prisma.userSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'user-1' }) }),
    );
  });

  it('switchTenant rejects a non-user principal', async () => {
    const service = buildService(deps);
    const servicePrincipal = { type: 'service_account', id: 'sa-1', tenantId: 'tenant-1', roles: [], permissions: [] };

    await expect(service.switchTenant(servicePrincipal as never, 'tenant-2', {})).rejects.toThrow(
      ForbiddenError,
    );
  });

  it('switchTenant rejects a tenant the user is not a member of', async () => {
    deps.userRepository.findMembership.mockResolvedValue(null);
    const service = buildService(deps);
    const principal: UserPrincipal = {
      type: 'user',
      id: asUserId('user-1'),
      tenantId: asTenantId('tenant-1'),
      email: 'a@b.com',
      roles: ['owner'],
      permissions: ['*'],
    };

    await expect(service.switchTenant(principal, 'tenant-2', {})).rejects.toThrow(ForbiddenError);
  });

  it('switchTenant issues new tokens for a valid membership', async () => {
    deps.userRepository.findMembership.mockResolvedValue({ role: 'MEMBER' });
    const service = buildService(deps);
    const principal: UserPrincipal = {
      type: 'user',
      id: asUserId('user-1'),
      tenantId: asTenantId('tenant-1'),
      email: 'a@b.com',
      roles: ['owner'],
      permissions: ['*'],
    };

    const tokens = await service.switchTenant(principal, 'tenant-2', {});
    expect(tokens.accessToken).toBe('access-token');
  });
});
