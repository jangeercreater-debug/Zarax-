# Multi-Region Readiness

## What's already multi-region-ready

- **Every service is stateless** (see `docs/architecture.md`) — no in-memory session
  state, conversation history lives in Redis, durable state lives in Postgres. Any
  service instance can serve any request. This is the hard prerequisite for
  multi-region deployment, and it's true from M1 onward, not bolted on later.
- **`DEPLOYMENT_REGION`** is already a validated env var (`baseEnvSchema`, present in
  every service since M3) and flows into every structured log line via `ZaraxLogger`,
  so region is already visible in observability data today.
- **Tenant isolation** (DB row-level, Redis key namespacing, Qdrant collection-per-
  tenant) is orthogonal to region — the same isolation guarantees hold whether a
  tenant's data lives in one region or is sharded across several.

## What's not yet built (this milestone documents, doesn't implement)

A genuine multi-region deployment needs decisions this codebase doesn't make yet:

1. **Data residency** — does a tenant's data need to stay in one region (GDPR/data
   residency contracts often require this)? If so, `Tenant` needs a `region` column,
   and every service needs region-aware routing to the correct regional Postgres/
   Redis/Qdrant instance for that tenant — today there's one global Postgres/Redis/
   Qdrant per environment.
2. **Read replicas vs. multi-primary** — the simplest multi-region step is a single
   primary Postgres with cross-region read replicas (services read from the nearest
   replica, write to the primary) — much simpler than multi-primary conflict
   resolution, and sufficient for "reduce read latency" without solving "survive a
   region outage for writes."
3. **Redis**: conversation state (`llm-orchestrator`) and rate-limit counters
   (`api-standards`) are regional by nature (a call/session happens in one region) —
   these don't need cross-region replication, just a Redis instance per region.
4. **Qdrant**: per-tenant collections could live in whichever region that tenant's
   data resides in — consistent with the existing collection-per-tenant isolation
   strategy, this is a routing decision, not a schema change.
5. **LiveKit**: already regional by design (LiveKit Cloud / self-hosted SFU clusters
   are typically deployed per-region with client-nearest-region selection) —
   `voice-gateway` would need to select the right LiveKit region per call.
6. **Event bus**: Redis pub/sub (`@zarax/event-bus`) is regional — a genuinely
   multi-region event bus would need either a global message broker (e.g. a managed
   Kafka/NATS with cross-region replication) or per-region event buses with explicit
   cross-region event forwarding for the few events that need it.

## Recommended path (future milestone)

Start with **active-passive**: one primary region serving all traffic, a warm standby
in a second region (replicated Postgres, empty Redis/Qdrant that rebuild on failover)
for disaster recovery — this gets most of the resilience benefit (survive a full
region outage) without touching data-residency/routing complexity. Active-active
multi-region (serving live traffic from multiple regions simultaneously) is a much
larger undertaking (conflict resolution, cross-region latency budgets) and should only
be pursued if a specific enterprise customer contract requires data residency in a
specific region — not preemptively.
