import type { PrismaClient } from '@prisma/client';
import { ConflictError, NotFoundError } from '@zarax/shared-errors';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string | null;
  isActive: boolean;
}

export class UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** findFirst (not findUnique) so the soft-delete filter can combine with the
   * unique-email lookup. */
  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.prisma.user.findFirst({ where: { email, deletedAt: null } });
  }

  async findByIdOrThrow(id: string): Promise<UserRecord> {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundError('User', id);
    return user;
  }

  /** `passwordHash` must already be hashed (argon2/bcrypt) by the caller — this
   * repository never hashes or compares passwords itself, keeping crypto choices
   * owned by the auth service rather than duplicated across repositories. */
  async create(params: {
    email: string;
    passwordHash: string;
    fullName?: string;
  }): Promise<UserRecord> {
    const existing = await this.findByEmail(params.email);
    if (existing) throw new ConflictError(`A user with email '${params.email}' already exists.`);

    return this.prisma.user.create({
      data: {
        email: params.email,
        passwordHash: params.passwordHash,
        fullName: params.fullName,
      },
    });
  }

  async createMembership(params: {
    userId: string;
    tenantId: string;
    role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
  }): Promise<void> {
    await this.prisma.tenantMembership.create({
      data: { userId: params.userId, tenantId: params.tenantId, role: params.role },
    });
  }

  /** Soft delete — see docs/data-retention-policy.md. Also deactivates the account
   * (isActive: false) so a concurrent login attempt fails even if a caller queries
   * without the deletedAt filter for some reason. */
  async softDelete(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date(), isActive: false },
    });
  }
}
