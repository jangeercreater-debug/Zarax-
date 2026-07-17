import { createHash, randomBytes } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — verification is lower-risk than a password reset, longer window is fine

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export interface CreatedVerificationToken {
  rawToken: string;
  expiresAt: Date;
}

export class EmailVerificationTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(userId: string): Promise<CreatedVerificationToken> {
    const rawToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await this.prisma.emailVerificationToken.create({
      data: { userId, tokenHash: hashToken(rawToken), expiresAt },
    });

    return { rawToken, expiresAt };
  }

  async validate(rawToken: string): Promise<{ userId: string; tokenId: string } | null> {
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) return null;
    return { userId: record.userId, tokenId: record.id };
  }

  async markUsed(tokenId: string): Promise<void> {
    await this.prisma.emailVerificationToken.update({
      where: { id: tokenId },
      data: { usedAt: new Date() },
    });
  }
}
