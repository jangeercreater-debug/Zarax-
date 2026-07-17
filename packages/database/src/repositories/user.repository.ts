import type { PrismaClient } from '@prisma/client';
import { ConflictError, NotFoundError } from '@zarax/shared-errors';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string | null;
  isActive: boolean;
  emailVerified: boolean;
}

export interface MembershipRecord {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: string;
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

  /** Every tenant this user belongs to — the data behind the organization switcher. */
  async listMemberships(userId: string): Promise<MembershipRecord[]> {
    const memberships = await this.prisma.tenantMembership.findMany({
      where: { userId, tenant: { deletedAt: null } },
      include: { tenant: true },
    });
    return memberships.map((m) => ({
      tenantId: m.tenantId,
      tenantName: m.tenant.name,
      tenantSlug: m.tenant.slug,
      role: m.role,
    }));
  }

  async findMembership(userId: string, tenantId: string): Promise<{ role: string } | null> {
    const membership = await this.prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    return membership ? { role: membership.role } : null;
  }

  async updateProfile(userId: string, params: { fullName?: string }): Promise<UserRecord> {
    return this.prisma.user.update({ where: { id: userId }, data: params });
  }

  /** `newPasswordHash` must already be hashed by the caller (see `create()`'s note). */
  async updatePassword(userId: string, newPasswordHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: newPasswordHash } });
  }

  async markEmailVerified(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { emailVerified: true } });
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
