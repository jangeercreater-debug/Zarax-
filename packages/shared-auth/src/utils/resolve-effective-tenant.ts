import { ValidationError } from '@zarax/shared-errors';
import { asTenantId, type Principal, type TenantId } from '@zarax/shared-types';

/**
 * Resolves which tenant a request should operate on — critical for every endpoint
 * that accepts a `service_account` Principal (internal service-to-service calls),
 * since a service account is itself bound to one fixed tenant (see
 * ServiceAccountRepository.validate()), which is almost never the tenant whose data
 * the CALLING service actually needs to act on (e.g. llm-orchestrator calling
 * rag-service's /search on behalf of whichever tenant's live conversation is
 * happening — not the tenant the service account happens to be registered under).
 *
 * - For a `service_account` Principal: the caller MUST explicitly pass the target
 *   tenantId (e.g. in the request body) — this function requires and returns it,
 *   throwing if it's missing.
 * - For a `user`/`api_key` Principal: their own Principal.tenantId is authoritative,
 *   always — any explicitTenantId they might also send is ignored. Trusting a
 *   human-facing caller's self-reported tenantId over their own authenticated
 *   Principal would be a straightforward cross-tenant privilege-escalation bug.
 */
export function resolveEffectiveTenantId(principal: Principal, explicitTenantId?: string): TenantId {
  if (principal.type === 'service_account') {
    if (!explicitTenantId) {
      throw new ValidationError(
        'This request must include a tenantId when called by a service account.',
      );
    }
    return asTenantId(explicitTenantId);
  }

  return principal.tenantId;
}
