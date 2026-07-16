# Database Migration & Rollback Strategy

ZaraX uses Prisma Migrate against PostgreSQL. This document is the operational runbook
for applying and, when necessary, rolling back schema changes safely across 7+
services sharing one schema (`packages/database/prisma/schema.prisma`).

## Commands

| Command | Environment | What it does |
|---|---|---|
| `pnpm db:migrate` (`prisma migrate dev`) | Local development only | Creates a new migration from schema changes, applies it, regenerates the client |
| `pnpm db:migrate:deploy` (`prisma migrate deploy`) | Staging/production | Applies pending migrations only — never generates new ones, never prompts |
| `pnpm db:generate` (`prisma generate`) | Any | Regenerates the Prisma client after a schema/migration change |
| `pnpm db:studio` | Local development only | Visual DB browser — never run against production |

**Production deploys only ever run `migrate deploy`.** `migrate dev` is interactive and
can reset data in ambiguous cases — it must never run outside a developer's machine.

## Why Prisma doesn't have automatic "down" migrations

Unlike some migration tools, Prisma Migrate doesn't generate a reversible pair for every
migration — each migration is a one-directional SQL file. This is a deliberate tradeoff
(auto-generated down-migrations are frequently wrong for anything beyond trivial
add-column changes, especially data migrations), so ZaraX's rollback strategy is:

### 1. Prefer forward-compatible, additive migrations

The default and strongly preferred path for any schema change:
- **Adding** a column: make it nullable or give it a default — never a required column
  with no default on an existing table with rows.
- **Renaming**: do it as two migrations — add the new column, backfill, dual-write from
  application code during a transition window, then drop the old column in a *later*
  migration once every service is confirmed to use the new one. Never a single
  rename-in-place migration for a column already read by running services.
- **Removing**: only after confirming no running service (check every service's
  Prisma schema usage) still reads the column.

This means most "rollbacks" are never needed — a bad forward migration is fixed by
another forward migration, and application code stays compatible with the
schema-before-last during any single deploy (standard expand/contract migration
pattern), so a service rollback (redeploying the previous container image) doesn't
require an accompanying schema rollback.

### 2. When a genuine rollback is unavoidable

For the rare case where a migration must be undone (e.g. it was clearly wrong and no
service depends on the new shape yet):

```bash
# 1. Write the compensating migration by hand (the inverse SQL), don't try to
#    auto-generate it:
pnpm --filter @zarax/database exec prisma migrate dev --create-only --name rollback_<original_migration_name>
# 2. Edit the generated (empty) migration.sql to contain the inverse operation.
# 3. Review, then apply:
pnpm db:migrate:deploy
```

### 3. Pre-deploy safety net

- **Always take a database snapshot/backup immediately before running
  `migrate deploy` in production** (managed Postgres providers — Railway, RDS, etc. —
  typically offer point-in-time recovery; confirm this is enabled before every deploy
  that includes a migration).
- Migration files, once merged to `main` and deployed anywhere, are **immutable** —
  never edit a already-applied migration's SQL; ship a new migration instead. Prisma
  tracks applied migrations by checksum and will refuse to proceed (correctly) if a
  deployed migration's file changes underneath it.
- CI should run `prisma migrate diff` (or equivalent) against a disposable database to
  catch a migration that would fail before it ever reaches staging/production.

## Ownership

`packages/database/prisma/schema.prisma` is the single source of truth for every
service's schema — there is intentionally no per-service schema. A schema change is
reviewed with the same care as any shared-package change (see
`docs/dependency-rules.md`), since every service that imports `@zarax/database`
regenerates its Prisma client against the same schema on install.
