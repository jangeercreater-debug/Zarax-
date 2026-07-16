# @zarax/redis-client

Layer 3 — `ioredis` wrapper with three pieces:

- `createRedisClient({ url })` — one connection per process per purpose (cache vs.
  BullMQ vs. pub/sub need separate connections; don't share one `Redis` instance across
  concerns).
- `CacheService` — tenant-namespaced cache (`tenant:{id}:{key}`), mirroring the tenant
  isolation enforced at the DB layer by `@zarax/database`'s `TenantScopedRepository`.
- `DistributedLock` — a pragmatic single-node lock (`SET NX PX` + atomic
  compare-and-delete release) for "don't run this twice" coordination across
  horizontally-scaled, stateless instances — e.g. `workflow-engine`'s scheduled triggers.

Note: `@zarax/event-bus` does **not** depend on this package — it uses `ioredis`
directly as an external dependency, to respect the Layer 2 (`event-bus`) vs. Layer 3
(`redis-client`) boundary in `docs/dependency-rules.md`.
