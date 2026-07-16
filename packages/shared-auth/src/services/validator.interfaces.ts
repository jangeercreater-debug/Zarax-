import type { ApiKeyPrincipal, ServiceAccountPrincipal } from '@zarax/shared-types';

export const API_KEY_VALIDATOR = Symbol('API_KEY_VALIDATOR');
export const SERVICE_ACCOUNT_VALIDATOR = Symbol('SERVICE_ACCOUNT_VALIDATOR');

/**
 * Implemented by the consuming service (typically `apps/gateway` or `services/api`,
 * backed by `@zarax/database`) and provided via DI under `API_KEY_VALIDATOR`.
 * shared-auth cannot implement this itself — it's a Layer 2 package and must not
 * depend upward on Layer 3's database client (see docs/dependency-rules.md).
 */
export interface ApiKeyValidator {
  /** Returns null for an invalid/revoked/expired key — never throws for "not found". */
  validate(rawKey: string): Promise<ApiKeyPrincipal | null>;
}

export interface ServiceAccountValidator {
  validate(rawToken: string): Promise<ServiceAccountPrincipal | null>;
}
