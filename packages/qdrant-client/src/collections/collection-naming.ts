import type { TenantId } from '@zarax/shared-types';

export type VectorCollectionPurpose = 'knowledge_base' | 'call_transcripts' | 'user_memory';

/**
 * Every tenant's vectors live in their own collection, never a shared collection
 * filtered by a tenant_id payload field — a misconfigured search query against a
 * shared collection is a possible cross-tenant data leak; a wrong *collection name*
 * simply 404s. Isolation is structural, not filter-dependent.
 */
export function tenantCollectionName(tenantId: TenantId, purpose: VectorCollectionPurpose): string {
  return `tenant_${tenantId}_${purpose}`;
}
