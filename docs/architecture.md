# ZaraX System Architecture (v0.3)

## Client → Gateway → Services flow

```
┌─────────┐  ┌─────────┐  ┌──────────┐
│   Web   │  │ Mobile  │  │  Widget  │   (all consume packages/sdk)
└────┬────┘  └────┬────┘  └────┬─────┘
     └────────────┼─────────────┘
                   ▼
           apps/gateway (BFF)
     - authn (shared-auth: Principal)
     - authz (RBAC guards)
     - tenant resolution
     - rate limiting, request validation
     - API versioning (/v1)
                   │
     ┌─────────────┼───────────────────────────────┐
     ▼             ▼             ▼                 ▼
services/api  rag-service  workflow-engine   tool-executor
     │             │             │                 │
     └─────────────┴──────┬──────┴─────────────────┘
                           ▼
                 event-bus (Redis pub/sub,
                 typed contracts from shared-types)

Real-time voice path (parallel, separate ingress):
Client (LiveKit SDK) → apps/voice-gateway → stt-service → llm-orchestrator → tts-service
                                                 │
                                         tool-executor (via event-bus, for function calls)
```

## Why two ingress points (`gateway` vs `voice-gateway`)

`apps/gateway` is a stateless REST/GraphQL BFF for CRUD, dashboard, and SDK traffic —
horizontally scaled behind a standard load balancer. `apps/voice-gateway` terminates
WebRTC/LiveKit sessions — different scaling characteristics (sticky-ish media routing,
LiveKit SFU coordination) and different failure modes, so it is deployed and scaled
independently rather than folded into the general-purpose gateway.

## Cross-cutting concerns (apply to every service)

- **Observability**: `shared-observability` gives every service `/health`, `/ready`,
  `/metrics` and OpenTelemetry trace propagation for free via one shared Nest module import.
- **Multi-tenancy**: `tenantId` flows from JWT/API-key/Principal → every DB query
  (tenant-scoped repository base class) → every Redis key namespace → every Qdrant
  collection name → every event payload.
- **Statelessness**: no service holds session/conversation state in memory; it lives in
  Redis (hot path) and Postgres (durable), so any instance can serve any request.

## Related documents

- `docs/dependency-rules.md` — enforceable import boundaries between packages/services/apps
- `docs/auth-design.md` — Principal abstraction, strategy layer, RBAC
