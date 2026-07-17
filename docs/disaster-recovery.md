# Database Backup & Disaster Recovery

## Backup strategy

- **Automated daily snapshots** — whichever managed Postgres provider ZaraX deploys to
  (Railway, RDS, Supabase, etc.) should have automated daily backups enabled with at
  least **7 days of point-in-time recovery (PITR)** retention. This is a provider
  dashboard setting, not application code — verify it's on before the first production
  tenant signs up, and re-verify after any infrastructure migration.
- **Pre-migration snapshot** — every `prisma migrate deploy` in production is preceded
  by an on-demand snapshot (see `docs/database-migrations.md`), independent of the
  automated daily schedule, since a migration is exactly the kind of change most likely
  to need a fast rollback.
- **Redis is not backed up** — by design. Everything in Redis (conversation state,
  rate-limit counters, cache entries, idempotency records) is either short-TTL
  ephemeral or reconstructible from Postgres. Losing Redis loses in-flight call state
  and cached values, not durable business data. No backup strategy is needed for it;
  a Redis outage is a `/ready` failure and a service restart, not a data-loss event.
- **Qdrant** — vector embeddings are reconstructible from source documents (re-run the
  ingestion pipeline) but re-embedding a large knowledge base costs real money
  (embedding API calls) and time. Recommend enabling whatever snapshot/backup feature
  the deployed Qdrant instance offers (self-hosted: `qdrant snapshot` API; Qdrant
  Cloud: managed backups) once tenant knowledge bases reach non-trivial size.

## Recovery Point Objective (RPO) / Recovery Time Objective (RTO)

Target for the current architecture (single-region, before multi-region work in
`docs/multi-region-readiness.md`):

| | Target | Basis |
|---|---|---|
| RPO (Postgres) | ≤ 5 minutes | Managed provider PITR granularity |
| RTO (Postgres) | ≤ 1 hour | Time to provision + restore + reconnect services |
| RPO (Redis) | N/A (no backup) | Ephemeral by design, see above |
| RPO (Qdrant) | Depends on last snapshot | Not yet automated — manual/scheduled snapshot cadence TBD per tenant data volume |

These are planning targets, not yet tested via a real disaster-recovery drill — the
next step before relying on them operationally is running an actual restore-from-backup
exercise against a staging environment.

## Recovery runbook (Postgres)

1. Identify the target restore point (a specific backup, or a PITR timestamp just
   before the incident).
2. Restore to a **new** database instance — never restore in-place over the live
   database, so the broken state remains available for forensics if needed.
3. Update `DATABASE_URL` (via each service's secret store — see
   `docs/production-standards.md` item #6) to point at the restored instance.
4. Run `prisma migrate deploy` against the restored instance if any migrations landed
   between the backup and the incident but aren't yet reflected in the restored schema.
5. Redeploy every service (a config/secret change requires a restart to take effect).
6. Verify via `/ready` on every service, then a smoke-test signup/login/call before
   resuming full traffic.

## Ownership

This document is the current best-effort plan; it should be revisited (and,
critically, **actually rehearsed**) before ZaraX carries production tenant traffic at
meaningful scale — an untested DR plan is a hypothesis, not a guarantee.
