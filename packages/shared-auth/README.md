# @zarax/shared-auth

Layer 2 — implements the `Principal`/strategy/RBAC design from `/docs/auth-design.md`.

## Wiring into a service

```ts
// app.module.ts
AuthModule.forRoot({
  // Optional — omit to disable that auth method for this service:
  apiKeyValidatorProvider: { provide: API_KEY_VALIDATOR, useClass: PrismaApiKeyValidator },
  serviceAccountValidatorProvider: { provide: SERVICE_ACCOUNT_VALIDATOR, useClass: PrismaServiceAccountValidator },
})
```

`CompositeAuthGuard`, `RolesGuard`, and `PermissionsGuard` are registered globally
(`APP_GUARD`) — every route is protected by default. Opt a route out with `@Public()`.

## Usage in a controller

```ts
@RequirePermission(PERMISSIONS.AGENTS_CREATE)
@Post('agents')
create(@CurrentPrincipal() principal: Principal, @Body() dto: CreateAgentDto) { ... }
```

## Why JWT validation never hits the database

Access tokens carry the resolved `roles`/`permissions` inline, signed at login time —
verifying a request only checks the signature and expiry, never a DB round trip. This is
what makes every service stateless and horizontally scalable. The tradeoff: a permission
change takes effect on next token refresh, not instantly. Revocation-sensitive paths
(API keys, service accounts) use validators that *do* check a database, since those are
long-lived credentials that must be revocable in real time.

## Extending with SSO/OAuth later

Add a new Passport strategy producing a `UserPrincipal`, register it in `AuthModule`, and
extend `CompositeAuthGuard`'s dispatch logic for the new credential shape. No controller,
guard, or decorator changes required — see `/docs/auth-design.md`.
