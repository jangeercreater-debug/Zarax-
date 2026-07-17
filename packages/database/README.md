# @zarax/database

Layer 3 — Prisma schema, generated client, and repositories. Owns the one enforceable
mechanism for multi-tenancy at the data layer: `TenantScopedRepository`.

## Multi-tenancy enforcement

Every tenant-scoped table (`agents`, `calls`, `api_keys`, `service_accounts`,
`tenant_memberships`) carries `tenant_id` + an index. Repositories for these tables
extend `TenantScopedRepository`, whose protected `findManyForTenant` / `findFirstForTenant`
/ `countForTenant` methods require a `tenantId` argument and inject it into the query —
there is no code path to query these tables without a tenant filter.

## Concrete auth validator implementations

`ApiKeyRepository` and `ServiceAccountRepository` implement `@zarax/shared-auth`'s
`ApiKeyValidator` / `ServiceAccountValidator` interfaces — this is where those Layer 2
interfaces get their real, DB-backed implementation. Wire them into a service's
`AuthModule.forRoot()`:

```ts
AuthModule.forRoot({
  apiKeyValidatorProvider: {
    provide: API_KEY_VALIDATOR,
    useFactory: (prisma: PrismaClient) => new ApiKeyRepository(prisma),
    inject: [PRISMA_CLIENT],
  },
})
```

## Soft delete

`Tenant`, `User`, and `Agent` carry a `deletedAt` column. Every repository read method
for these filters `deletedAt: null` by default (using `findFirst`, not `findUnique`,
since `findUnique` can't combine a unique-field lookup with an extra filter) — there is
no "include deleted" flag; a soft-deleted row simply doesn't come back from a normal
read. See `docs/data-retention-policy.md` for the retention/purge strategy this sets up.

## Agent versioning & rollback

`AgentRepository.createVersion()` snapshots `Agent.config` into an immutable
`AgentVersion` row and atomically updates the Agent's live config in one transaction.
`rollbackToVersion()` doesn't rewrite history — it creates a *new* version whose config
matches an old one, so `listVersions()` always reads as an honest, append-only audit
trail. This also covers prompt version history, since the system prompt lives inside
`config` — see `docs/production-standards.md` items #19/#20.

## Commands

- `pnpm db:migrate` (root) — `prisma migrate dev`
- `pnpm db:studio` (root) — visual DB browser
- `pnpm db:generate` (root) — regenerate the Prisma client after a schema change

See also: `docs/database-migrations.md` (migration/rollback strategy),
`docs/disaster-recovery.md` (backup/DR runbook).
