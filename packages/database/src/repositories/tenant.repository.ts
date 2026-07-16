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

  async findById(tenantId: TenantId): Promise<Tenant | null> {
    const record = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    return record ? toDomain(record) : null;
  }

  async findByIdOrThrow(tenantId: TenantId): Promise<Tenant> {
    const tenant = await this.findById(tenantId);
    if (!tenant) throw new NotFoundError('Tenant', tenantId);
    return tenant;
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    const record = await this.prisma.tenant.findUnique({ where: { slug } });
    return record ? toDomain(record) : null;
  }

  async create(params: { name: string; slug: string }): Promise<Tenant> {
    const record = await this.prisma.tenant.create({
      data: { name: params.name, slug: params.slug },
    });
    return toDomain(record);
  }
}
