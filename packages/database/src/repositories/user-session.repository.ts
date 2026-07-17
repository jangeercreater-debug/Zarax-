import { createHash } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export interface UserSessionRecord {
  id: string;
  userId: string;
  tenantId: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  revokedAt: Date | null;
}

export class UserSessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** Called once per login/signup — creates the session row and returns its id, to be
   * embedded in the refresh token's `sessionId` claim. Accepts a pre-generated `id` so
   * the caller can embed that same id in the refresh token's JWT payload before this
   * row exists — otherwise signing the token would need the DB-generated id first,
   * requiring a sign → create → re-sign round trip for no real benefit. */
  async create(params: {
    id?: string;
    userId: string;
    tenantId: string;
    refreshToken: string;
    userAgent?: string;
    ipAddress?: string;
  }): Promise<{ sessionId: string }> {
    const session = await this.prisma.userSession.create({
      data: {
        ...(params.id ? { id: params.id } : {}),
        userId: params.userId,
        tenantId: params.tenantId,
        refreshTokenHash: hashToken(params.refreshToken),
        userAgent: params.userAgent,
        ipAddress: params.ipAddress,
      },
    });
    return { sessionId: session.id };
  }

  /** Called on every refresh — replaces the stored hash with the newly-issued
   * refresh token's hash (refresh token rotation) and bumps lastUsedAt. Returns false
   * if the session doesn't exist, is revoked, or the presented token doesn't match
   * what's on file (a stolen/replayed old refresh token fails this check). */
  async validateAndRotate(sessionId: string, presentedRefreshToken: string, newRefreshToken: string): Promise<boolean> {
    const session = await this.prisma.userSession.findUnique({ where: { id: sessionId } });
    if (!session || session.revokedAt) return false;
    if (session.refreshTokenHash !== hashToken(presentedRefreshToken)) return false;

    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { refreshTokenHash: hashToken(newRefreshToken), lastUsedAt: new Date() },
    });
    return true;
  }

  async listForUser(userId: string): Promise<UserSessionRecord[]> {
    return this.prisma.userSession.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastUsedAt: 'desc' },
    });
  }

  async revoke(userId: string, sessionId: string): Promise<boolean> {
    const result = await this.prisma.userSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count > 0;
  }

  async revokeAllForUser(userId: string, exceptSessionId?: string): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
      data: { revokedAt: new Date() },
    });
  }
}
