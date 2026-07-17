import type { PrismaClient, Tenant as PrismaTenant } from '@prisma/client';
import { NotFoundError } from '@zarax/shared-errors';
import { asTenantId, type Tenant, type TenantId } from '@zarax/shared-types';

function toDomain(record: PrismaTenant): Tenant {
  return {
    id: asTenantId(record.id),
    name: record.name,
    slug: record.slug,
    plan: record.plan.toLowerCase() as Tenant['plan'],
    status: record.status.toLowerCase() as Tenant['status'],
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export class TenantRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** Uses findFirst (not findUnique) so the soft-delete filter can be combined with
   * the id lookup — findUnique only accepts genuinely unique-constraint fields in its
   * where clause, and `deletedAt` isn't part of the unique index on `id`. */
  async findById(tenantId: TenantId): Promise<Tenant | null> {
    const record = await this.prisma.tenant.findFirst({ where: { id: tenantId, deletedAt: null } });
    return record ? toDomain(record) : null;
  }

  async findByIdOrThrow(tenantId: TenantId): Promise<Tenant> {
    const tenant = await this.findById(tenantId);
    if (!tenant) throw new NotFoundError('Tenant', tenantId);
    return tenant;
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    const record = await this.prisma.tenant.findFirst({ where: { slug, deletedAt: null } });
    return record ? toDomain(record) : null;
  }

  async create(params: { name: string; slug: string }): Promise<Tenant> {
    const record = await this.prisma.tenant.create({
      data: { name: params.name, slug: params.slug },
    });
    return toDomain(record);
  }

  /** Soft delete — the tenant row (and every child row referencing it) stays intact;
   * application-level reads exclude it. See docs/data-retention-policy.md for the
   * eventual hard-delete/purge story. */
  async softDelete(tenantId: TenantId): Promise<void> {
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { deletedAt: new Date(), status: 'ARCHIVED' },
    });
  }
}
