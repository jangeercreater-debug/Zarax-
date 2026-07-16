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

## Commands

- `pnpm db:migrate` (root) — `prisma migrate dev`
- `pnpm db:studio` (root) — visual DB browser
- `pnpm db:generate` (root) — regenerate the Prisma client after a schema change
