import { createHash, randomBytes } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour — long enough to check email, short enough to limit exposure

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export interface CreatedResetToken {
  rawToken: string; // only ever returned once, at creation — never stored or logged in plaintext elsewhere
  expiresAt: Date;
}

export class PasswordResetTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(userId: string): Promise<CreatedResetToken> {
    const rawToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await this.prisma.passwordResetToken.create({
      data: { userId, tokenHash: hashToken(rawToken), expiresAt },
    });

    return { rawToken, expiresAt };
  }

  /** Returns the userId if the token is valid (exists, unexpired, unused), else null.
   * Does NOT mark it used — call markUsed() separately once the password change
   * actually succeeds, so a failed reset attempt doesn't burn the token. */
  async validate(rawToken: string): Promise<{ userId: string; tokenId: string } | null> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) return null;
    return { userId: record.userId, tokenId: record.id };
  }

  async markUsed(tokenId: string): Promise<void> {
    await this.prisma.passwordResetToken.update({
      where: { id: tokenId },
      data: { usedAt: new Date() },
    });
  }
}
