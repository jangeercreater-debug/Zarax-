import type { ApiKeyId, ServiceAccountId, TenantId, UserId } from '../tenant/tenant.types';

/**
 * Every authentication strategy (JWT session, API key, service account, future OAuth/SSO)
 * converges on producing a Principal. Authorization (RBAC guards) depends only on this
 * shape — never on which strategy authenticated the caller. See /docs/auth-design.md.
 */
export type PrincipalType = 'user' | 'service_account' | 'api_key';

export interface BasePrincipal {
  tenantId: TenantId;
  type: PrincipalType;
  /** Flattened, already-resolved permission strings, e.g. 'calls:create', 'agents:*'. */
  permissions: string[];
  roles: string[];
  /** Present for api_key/service_account principals to bound their blast radius. */
  scopes?: string[];
  metadata?: Record<string, unknown>;
}

export interface UserPrincipal extends BasePrincipal {
  type: 'user';
  id: UserId;
  email: string;
  /** Ties this Principal back to the UserSession row behind its access token — set
   * only for tokens issued after session tracking was introduced (see
   * @zarax/shared-auth's AccessTokenPayload). Lets the profile/session-management UI
   * mark "this is your current session" without an extra round trip. */
  sessionId?: string;
}

export interface ApiKeyPrincipal extends BasePrincipal {
  type: 'api_key';
  id: ApiKeyId;
  /** The tenant-visible label for the key (e.g. "Zapier integration"), never the raw secret. */
  label: string;
}

export interface ServiceAccountPrincipal extends BasePrincipal {
  type: 'service_account';
  id: ServiceAccountId;
  serviceName: string;
}

export type Principal = UserPrincipal | ApiKeyPrincipal | ServiceAccountPrincipal;

export const isUserPrincipal = (p: Principal): p is UserPrincipal => p.type === 'user';
export const isApiKeyPrincipal = (p: Principal): p is ApiKeyPrincipal => p.type === 'api_key';
export const isServiceAccountPrincipal = (p: Principal): p is ServiceAccountPrincipal =>
  p.type === 'service_account';
