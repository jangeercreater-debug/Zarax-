# Authentication & Authorization Design

## Goal

Support today's requirement (email/password + JWT sessions) while guaranteeing that adding
SSO, OAuth providers, API Keys, and Service Accounts later requires **adding** a strategy,
never modifying existing controllers, guards, or business logic.

## The `Principal` abstraction

Every authenticated request resolves to a `Principal`, regardless of how it authenticated:

```ts
interface Principal {
  id: string;
  tenantId: string;
  type: 'user' | 'service_account' | 'api_key';
  roles: string[];
  permissions: string[];   // resolved, flattened permission set
  scopes?: string[];       // for api_key/service_account: what it's limited to
  metadata: Record<string, unknown>;
}
```

Controllers and services depend on `Principal`, never on "the JWT payload" or "the API key
record" directly. `@CurrentPrincipal()` param decorator injects it.

## Strategy layer (pluggable, parallel)

Each strategy's only job is: verify the credential, produce a `Principal`.

| Strategy | Credential | Status |
|---|---|---|
| `JwtStrategy` | Short-lived JWT + refresh token | Built now |
| `ApiKeyStrategy` | Hashed API key (per-tenant, scoped) | Built now (stub) |
| `ServiceAccountStrategy` | Signed service JWT / mTLS client cert | Built now (stub) |
| `OAuthStrategy` (per-provider) | OAuth2/OIDC (Google, Microsoft, generic SSO/SAML bridge) | Interface reserved, providers added later |

All strategies are registered in `shared-auth`'s `AuthModule` via NestJS Passport strategy
composition — a request matches whichever strategy fits its credential shape (`Authorization:
Bearer <jwt>` vs `X-API-Key: <key>` vs mTLS), and every path converges on producing a
`Principal`.

## Authorization layer (RBAC) — decoupled from authentication

- Roles map to permission sets, stored per-tenant (tenants can customize/extend roles later —
  schema supports this from day one even if the UI to manage it comes later).
- `@RequirePermission('calls:create')` / `@RequireRole('admin')` guards inspect
  `Principal.permissions` / `.roles` — they never know or care whether the caller authenticated
  via JWT, API key, or OAuth.
- Multi-tenant isolation is enforced at this layer too: every guard implicitly checks
  `Principal.tenantId` against the resource's `tenantId` before permission checks run.

## Why this avoids future rework

- **SSO**: add an `OAuthStrategy` implementation per provider; it still outputs a `Principal`.
  No controller changes.
- **API Keys for external developers**: `ApiKeyStrategy` already exists as a stub; enabling it
  is a config/rollout change.
- **Service Accounts** (service-to-service, e.g. `workflow-engine` calling `tool-executor`):
  same mechanism, `type: 'service_account'`, scopes limit blast radius.
- **RBAC changes** (new roles, finer permissions): only touches the permission-resolution
  step that builds `Principal.permissions` — guards and controllers are untouched.

## Critical pattern: never trust a service account's own tenantId for the request it's making

A `ServiceAccount` row is bound to one fixed tenant (`ServiceAccountRepository.validate()`
returns that tenant on its Principal) — but a service account calling another service is
almost always acting *on behalf of* a different, specific tenant (e.g. llm-orchestrator
calling rag-service's `/search` for whichever tenant's live conversation is happening,
not the tenant the service account happens to be registered under). Using
`principal.tenantId` directly in an endpoint that accepts `service_account` callers is a
real, severe cross-tenant bug — found and fixed during the M8 production audit in exactly
two places: `rag-service`'s `/search` and `llm-orchestrator`'s `/conversations/:id/turns`.

**The rule**: any endpoint documented as accepting `service_account` Principals must
require the caller to pass the target `tenantId` explicitly in the request body, and
resolve it via `@zarax/shared-auth`'s `resolveEffectiveTenantId(principal, dto.tenantId)`
— which requires and trusts that explicit value only for a `service_account` caller,
and ignores it entirely for a `user`/`api_key` caller (whose own authenticated
`principal.tenantId` is always authoritative, so they can never widen their own access
by sending a different tenantId). Every new internal service-to-service endpoint should
use this helper from the start, not `principal.tenantId` directly.
