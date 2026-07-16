import type { TenantId } from '@zarax/shared-types';

/**
 * Minimal shape every Prisma delegate (`prisma.agent`, `prisma.call`, ...) satisfies for
 * the operations this base class needs. Kept narrow deliberately so concrete
 * repositories can still use the full Prisma delegate for anything beyond these basics.
 */
export interface TenantScopedDelegate<TModel, TWhereInput extends Record<string, unknown>> {
  findMany(args: { where: TWhereInput }): Promise<TModel[]>;
  findFirst(args: { where: TWhereInput }): Promise<TModel | null>;
  count(args: { where: TWhereInput }): Promise<number>;
}

/**
 * Every repository for a tenant-scoped table extends this instead of calling
 * `prisma.<model>` directly. The tenant filter is injected by the base class, so a
 * developer cannot accidentally write a query that omits it — the only way to query is
 * through methods that require a `tenantId` argument up front.
 *
 * Concrete repositories still have full access to their own Prisma delegate for
 * writes/updates (`create`, `update`, `delete`) — those calls set `tenantId` explicitly
 * as part of the write payload rather than a `where` filter, so they're not abstracted
 * here, but code review / the repository's own method signatures should always require
 * a `tenantId` parameter for those too.
 */
export abstract class TenantScopedRepository<
  TModel,
  TWhereInput extends Record<string, unknown>,
> {
  protected constructor(
    private readonly delegate: TenantScopedDelegate<TModel, TWhereInput>,
    /** The key on the model's `where` input that holds the tenant FK — almost always
     * `'tenantId'`, exposed as a param in case a join table names it differently. */
    private readonly tenantIdField: keyof TWhereInput = 'tenantId' as keyof TWhereInput,
  ) {}

  protected async findManyForTenant(
    tenantId: TenantId,
    where: Omit<TWhereInput, never> = {} as TWhereInput,
  ): Promise<TModel[]> {
    return this.delegate.findMany({
      where: { ...where, [this.tenantIdField]: tenantId } as TWhereInput,
    });
  }

  protected async findFirstForTenant(
    tenantId: TenantId,
    where: TWhereInput = {} as TWhereInput,
  ): Promise<TModel | null> {
    return this.delegate.findFirst({
      where: { ...where, [this.tenantIdField]: tenantId } as TWhereInput,
    });
  }

  protected async countForTenant(
    tenantId: TenantId,
    where: TWhereInput = {} as TWhereInput,
  ): Promise<number> {
    return this.delegate.count({
      where: { ...where, [this.tenantIdField]: tenantId } as TWhereInput,
    });
  }
}
