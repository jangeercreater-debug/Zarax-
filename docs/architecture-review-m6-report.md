# ZaraX Architecture Review Report

**Scope:** Full monorepo (M1–M6B) — 13 shared packages, 7 services, 1 app.
**Date:** Pre-M7 checkpoint.
**Method:** Static analysis (import-graph tracing, dependency audits via script,
targeted `tsc` syntax checks, manual code reading). No `pnpm install` was possible in
this environment (no network access), so this is not a substitute for a real
`turbo run build` / `turbo run test` in CI — that should still be the gate before any
production deploy. Every finding below is backed by a specific file/line, not assumed.

---

## 1. Independent build verification

Every service/package has its own `package.json` with a `build` script and its own
`tsconfig.json` (except `eslint-config` and `tsconfig`, which are config-only packages
with nothing to compile — correct by design). A syntax-level `tsc` check was run against
every package's source in isolation; after fixes below, the only remaining flagged lines
are confirmed false positives caused by this sandbox lacking installed
`node_modules` (missing `zod`/`@nestjs/common` types break TS's control-flow narrowing
in an ad-hoc single-file check, not in a real build with dependencies resolved).

**Status: PASS**, with the caveat above. Recommend running `pnpm install && turbo run
build` in CI as the real gate before this is fully trusted.

## 2. Dependency audit

Cross-checked every `import` in every package's `src/` against its declared
`dependencies`/`devDependencies`/`peerDependencies`. Found and fixed **6 real gaps**:

| Package | Missing dependency | Severity |
|---|---|---|
| `rag-service` | `@zarax/redis-client` (used in `app.module.ts`) | **High** — would fail to build/run at all |
| `ai-sdk` | `@nestjs/common` (used in `ai-sdk.module.ts`) | High — same |
| `shared-auth` | `zod` (type-only, `z.infer`) | Medium — works today via hoisting, violates the project's own "no relying on hoisting" rule |
| `stt-service`, `tts-service`, `voice-gateway` | `express` (type-only imports) | Low — same hoisting caveat, only `@types/express` was declared |
| `tts-service` | `class-validator` (used in `SynthesizeDto`) | **High** — would fail to build |

All fixed. Re-ran the audit after fixes: **clean**.

## 3. Circular dependency detection

Built the full `@zarax/*` → `@zarax/*` dependency graph from every `package.json` and
ran cycle detection (DFS). **No cycles found.** The graph also correctly matches the
documented layering in `docs/dependency-rules.md` (Layer 0 → 1 → 2 → 3, strictly
downward) — verified by inspection of the resolved graph, not just assumed.

## 4. Shared package import correctness

- Every `@zarax/*` package referenced anywhere in the monorepo resolves to a real,
  existing package (no typos/stale references).
- Every internal dependency consistently uses the `workspace:*` protocol.

**Status: PASS.**

## 5. Duplicated business logic

Found and fixed **two real instances of duplicated boilerplate**:

- **`common/database.module.ts`** — an identical ~10-line Prisma-client DI shim was
  copy-pasted verbatim into 5 services (`api`, `tool-executor`, `rag-service`,
  `llm-orchestrator`, `voice-gateway`). Extracted into `@zarax/database` itself as
  `PrismaClientModule.forRoot()` — all 5 local copies deleted, all call sites updated.
- **`common/redis.module.ts`** — duplicated between `voice-gateway` and
  `llm-orchestrator`, and **inconsistently** (one used `CacheService` as its own DI
  token, the other used a `REDIS_CACHE` Symbol — a real inconsistency, not just
  duplication). Extracted into `@zarax/redis-client` as `RedisCacheModule.forRoot()`,
  standardized on the `REDIS_CACHE`/`REDIS_CLIENT` Symbol tokens, both local copies
  deleted.

No other duplicated service/guard/business-logic classes were found (the only other
same-named files across services — `app.module.ts`, `main.ts`, `env.schema.ts` — were
verified to have genuinely different content per service, which is expected and
correct, not duplication).

## 6. Event contract validation

Traced every `publish`/`subscribe` pair:

- **`tool.execution_requested`**: published by `llm-orchestrator`'s `ToolCallBroker`,
  consumed by `tool-executor`'s `ToolExecutionConsumer`. Payload shape matches
  `ToolExecutionRequestedPayload` exactly on both ends (including `agentId`, added
  during M6B).
- **`tool.execution_completed`**: published by `tool-executor`, consumed by
  `llm-orchestrator`. Payload shape matches `ToolExecutionCompletedPayload` exactly.
- **`call.started` / `call.ended`**: published by `voice-gateway`'s
  `CallSessionService`, payload shapes match `CallStartedPayload`/`CallEndedPayload`
  exactly. **No subscriber currently exists** for either — this is a known, expected gap
  (persisting `Call` records to Postgres is unbuilt future work), not a bug, since
  nothing currently claims that pipeline is complete.

**Status: PASS**, with the documented gap noted above for future planning.

## 7. Tenant isolation verification

- **Postgres**: every tenant-scoped repository extends `TenantScopedRepository`,
  structurally preventing an unscoped query. Found **one real, non-critical logic gap**:
  `AuthService.login()` looks up the user's tenant membership via
  `prisma.tenantMembership.findFirst({ where: { userId } })` with **no tenant filter** —
  arbitrary (whichever Postgres returns first) if a user ever belongs to more than one
  tenant. This is *not* a cross-tenant data leak (it can't expose another user's data),
  but a login-correctness gap: a multi-tenant user could land in the wrong tenant.
  Currently **dormant** — no "invite an existing user to a second tenant" feature exists
  yet, so no user can currently have >1 membership. **Flagging for a product decision**
  (tenant-picker step, or a `tenantSlug` login parameter) before that invite feature is
  built, rather than patching around it now. `AuthService.refresh()` — the other call
  site — correctly filters by `tenantId` from the refresh token's own claims.
- **Redis**: every `cache.get/set/delete` call site passes `tenantId` as the first
  argument, which `CacheService` uses to namespace the key (`tenant:{id}:...`). Verified
  across every call site in `voice-gateway` and `llm-orchestrator` — no bypasses.
- **Qdrant**: every `VectorStoreService.upsert/search` call passes `tenantId`, which
  resolves to a collection-per-tenant name, not a shared collection filtered by payload
  (the stronger isolation strategy documented in `qdrant-client`'s README). No bypasses.

**Status: PASS**, with one flagged (dormant) login-flow gap for future attention.

## 8. Authentication & authorization across internal APIs

Enumerated every `@Controller` and its guard posture:

| Controller | Guard | Assessment |
|---|---|---|
| `stt-service` transcribe, `tts-service` synthesize, `tool-executor` tools | `InternalTokenGuard` | Correct — internal-only workers, shared-secret model |
| `voice-gateway` LiveKit webhook | `@Public()` | Correct — authenticated by cryptographic signature verification instead, not Principal auth |
| `api` auth (signup/login/refresh) | `@Public()` per-method | Correct — no token exists yet at these entry points |
| `api` tenants, `rag-service` knowledge-base, `llm-orchestrator` conversations, `voice-gateway` rooms | Global `CompositeAuthGuard`/`PermissionsGuard` (via `AuthModule.forRoot()`, confirmed wired in all 4) | Correct — protected by default, `@RequirePermission` applied where the design calls for it (`knowledge_base:manage`, `calls:create`) |

**Status: PASS.** No endpoint found unintentionally open.

## 9. Redis / PostgreSQL / Qdrant scalability review

- **Fixed a real gap**: `DATABASE_POOL_MAX` was declared and validated in every
  service's env schema but **never actually applied** to the Prisma client — each
  service ran on Prisma's uncontrolled default pool size. At N horizontally-scaled
  replicas × an uncapped pool, this risks exhausting Postgres's `max_connections` far
  earlier than the config implies it should. Fixed: `createPrismaClient()` now applies
  `poolMax` via Prisma's `connection_limit` connection-string parameter; all 5 call
  sites updated to pass it from `process.env.DATABASE_POOL_MAX`.
- **Redis**: one connection per process per purpose, confirmed no per-request
  connection creation anywhere (`createRedisClient()` called once at module-composition
  time in every service, matching the documented pattern).
- **Qdrant**: collection-per-tenant isolation is good for scalability (no filtered scan
  over a shared collection). **Minor, non-blocking observation**: `VectorStoreService.
  upsert()` calls `collectionExists()` on every single ingestion call, even after the
  collection is known to exist — a small avoidable round-trip under high-throughput
  ingestion. Not fixed now (correctness is fine, this is a pure optimization); worth an
  in-memory "known collections" cache if ingestion volume becomes a bottleneck.
- No N+1 query patterns found in any loop across the codebase (checked every
  `for`/`.map(async`/`.forEach(async` site for embedded repository/Prisma calls).

**Status: PASS**, with one real fix applied and one minor optimization documented for later.

---

## Summary of changes made during this review

| # | Change | Files affected |
|---|---|---|
| 1 | Added 6 missing package.json dependencies | `rag-service`, `ai-sdk`, `shared-auth`, `stt-service`, `tts-service`, `voice-gateway` |
| 2 | Extracted `PrismaClientModule` into `@zarax/database`; deleted 5 duplicate local modules | `packages/database` + 5 services |
| 3 | Extracted `RedisCacheModule` into `@zarax/redis-client`; deleted 2 duplicate/inconsistent local modules | `packages/redis-client` + `voice-gateway`, `llm-orchestrator` |
| 4 | Fixed `DATABASE_POOL_MAX` never being applied to the Prisma connection pool | `packages/database/src/client.ts` + 5 app.module.ts call sites |

## Open items carried forward (not fixed — require a product/design decision, not a bug patch)

1. `AuthService.login()`'s multi-tenant-membership ambiguity (§7) — needs a tenant-picker
   or `tenantSlug` parameter design before an "invite to second tenant" feature ships.
2. `call.started`/`call.ended` events have no subscriber yet — needs a
   call-history-persistence consumer (likely in `services/api`) in a future milestone.
3. Qdrant's per-upsert `collectionExists()` check (§9) — optimize if ingestion volume
   warrants it.

None of these block M7.
