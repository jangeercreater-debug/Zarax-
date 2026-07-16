/**
 * Branded string types prevent accidentally passing a raw string where a specific
 * entity ID is expected (e.g. passing a UserId where a TenantId is required compiles
 * fine with plain `string`, but fails to compile with branded types).
 */
type Brand<TBase, TBrand extends string> = TBase & { readonly __brand: TBrand };

export type TenantId = Brand<string, 'TenantId'>;
export type UserId = Brand<string, 'UserId'>;
export type ApiKeyId = Brand<string, 'ApiKeyId'>;
export type ServiceAccountId = Brand<string, 'ServiceAccountId'>;

export const asTenantId = (value: string): TenantId => value as TenantId;
export const asUserId = (value: string): UserId => value as UserId;
export const asApiKeyId = (value: string): ApiKeyId => value as ApiKeyId;
export const asServiceAccountId = (value: string): ServiceAccountId => value as ServiceAccountId;

export type TenantPlan = 'free' | 'starter' | 'growth' | 'enterprise';

export type TenantStatus = 'active' | 'suspended' | 'pending_setup' | 'archived';

/**
 * Canonical tenant shape shared between the database layer, the gateway, and any
 * client that needs to render tenant context. Persistence-specific fields (internal
 * billing IDs, etc.) stay in the database package's Prisma model, not here.
 */
export interface Tenant {
  id: TenantId;
  name: string;
  slug: string;
  plan: TenantPlan;
  status: TenantStatus;
  createdAt: string; // ISO 8601 — wire format is always string, never Date, across service boundaries
  updatedAt: string;
}

/**
 * Anything that is inherently scoped to a tenant should extend this, so tenant
 * isolation is visible in the type signature, not just enforced at runtime.
 */
export interface TenantScoped {
  tenantId: TenantId;
}
