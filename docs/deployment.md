# M8 — Production Deployment Audit & Deployment Report

Audit date: this milestone. Scope: every service/app, every shared package, every
Dockerfile, every env schema, Railway/Vercel config, and the third-party integration
points (Neon, Qdrant, LiveKit, Deepgram, Cartesia, Redis). No new product features
were added — every change below is a fix to something that would otherwise block or
undermine a real deployment.

---

## Critical blockers — must fix before any deployment

### 1. No `pnpm-lock.yaml` committed
Every Dockerfile runs `pnpm install --frozen-lockfile`, which **fails outright**
without a committed lockfile. This sandbox has never had network access to run a
real `pnpm install`, so no lockfile has ever been generated.
**Fix (you, in Codespaces):**
```bash
pnpm install
git add pnpm-lock.yaml
git commit -m "chore: add pnpm-lock.yaml"
```
Do this once, before the first deploy of anything.

### 2. No live-call audio pipeline exists yet
This is the most important structural finding of this audit. `voice-gateway` mints
LiveKit rooms and tokens; `stt-service`/`tts-service` expose WebSocket endpoints;
`llm-orchestrator` processes a turn given text. **Nothing in this codebase currently
joins a LiveKit room as a participant, subscribes to the caller's audio track,
streams it to stt-service, forwards the transcript to llm-orchestrator, and plays
the response back through tts-service.** `RoomServiceClient` in voice-gateway is only
used for room *administration* (create/delete), not for joining a room and handling
media.
Building this (a LiveKit "agent" worker — likely using LiveKit's own Agents
framework, or a custom participant process) is real, non-trivial scope, deliberately
**not** built in this audit-only milestone. Every other piece (rooms, STT, TTS,
orchestration, agent config) is real and independently working — this is the one
missing link for an actual end-to-end call. Budget this as its own milestone before
promising "first AI call" to anyone.

### 3. No way to provision ServiceAccounts existed (now fixed)
`ServiceAccountRepository` only had a `validate()` method — no `create()`, no API
endpoint, no seed script. Every service-to-service call built in M7E/M7F
(Test Agent, the Voice Agent Builder's tool catalog, the Workflow Builder's AI
Agent/Knowledge Base nodes) depends on a real ServiceAccount + raw token existing,
and there was no way to create one.
**Fixed**: added `packages/database/scripts/seed-service-accounts.ts`. Run once,
after your first tenant exists and before you rely on Test Agent / workflow
execution:
```bash
pnpm db:seed-service-accounts --tenant-id=<a-real-tenant-id>
```
It prints each raw token exactly once — copy them into the env vars it lists (see
the table it prints).

### 4. Critical multi-tenancy bug in service-to-service calls (now fixed)
`rag-service`'s `/search` and `llm-orchestrator`'s `/conversations/:id/turns` both
derived the operating tenant from `principal.tenantId` — correct for a human/API-key
caller, but **wrong for a service_account caller**, whose Principal is bound to
whatever single tenant its ServiceAccount row happens to reference, not the tenant
whose data the calling service actually needs. This meant every RAG search and every
AI Agent workflow/Test Agent call, once service accounts existed, would search or
run against the *wrong* tenant's data — a real cross-tenant data isolation bug, not
just a functional one.
**Fixed**: added `@zarax/shared-auth`'s `resolveEffectiveTenantId(principal,
explicitTenantId)` — requires and trusts an explicit `tenantId` in the request body
only for a `service_account` Principal; a `user`/`api_key` Principal's own
authenticated tenantId is always authoritative regardless of anything else in the
payload (this is the anti-privilege-escalation guarantee). Both controllers now use
this helper. The four calling clients (services/api's and workflow-engine's
`LlmOrchestratorClient`s, llm-orchestrator's `RagClient`, workflow-engine's
`RagSearchClient`) already sent `tenantId` correctly — only the two receiving
controllers were the gap.

---

## Warnings — fix before relying on the affected feature, not necessarily before first deploy

- **`workflow-engine`'s build script inconsistency (fixed)**: declared `@nestjs/cli`
  but built with raw `tsc` and had no `nest-cli.json`, unlike every other NestJS
  service. Added `nest-cli.json`, changed `build`/`dev` scripts to `nest build`/`nest
  start --watch` for consistency (and `deleteOutDir` behavior).
- **`llm-orchestrator` used the deprecated `aiProvidersEnvSchema` (fixed)**: pulled in
  Deepgram/Cartesia/LiveKit key validation it never uses (those belong to
  stt-service/tts-service/voice-gateway). Switched to the narrower
  `llmProvidersEnvSchema`, matching the shared schema file's own deprecation note.
- **`services/api` unnecessarily validated LLM provider keys (fixed)**: it never
  calls any LLM provider directly (Test Agent proxies through llm-orchestrator over
  HTTP) — removed the unneeded `llmProvidersEnvSchema` merge and the corresponding
  unused keys from its `.env.example`, and added the `GEMINI_API_KEY` it *was*
  missing before that cleanup.
- **Env var naming inconsistency across services (fixed)**: llm-orchestrator called
  its tool-executor token `TOOL_EXECUTOR_INTERNAL_TOKEN`; services/api called the
  same kind of value `TOOL_EXECUTOR_INTERNAL_SERVICE_TOKEN`. Renamed
  llm-orchestrator's to match.
- **`workflow-engine` was missing `METRICS_ENABLED` from its `.env.example` (fixed)**
  — every other service lists it explicitly even though it has a default.
- **No `directUrl` in `schema.prisma` for Neon/PgBouncer compatibility (fixed)** —
  added `directUrl = env("DATABASE_URL_UNPOOLED")`. Migrations (`prisma migrate
  deploy`) must run against the *unpooled* connection string; the app's runtime
  `DATABASE_URL` can safely be the pooled one. If you're not using a connection
  pooler, set `DATABASE_URL_UNPOOLED` to the same value as `DATABASE_URL`.
- **No Railway or Vercel config existed anywhere (fixed)** — added `railway.json` to
  every backend service and `vercel.json` to `apps/web`. See "Exact deployment order"
  below for the dashboard settings each one assumes.
- **CORS is currently wide open (`origin: true`) on every service** — acceptable for
  now since auth is Bearer-token-based (not cookie-based) between services, so CORS
  isn't the primary security boundary here, but worth tightening to known origins
  once your actual frontend domain is fixed.
- **26 empty leftover directories from failed shell commands across the repo's
  history (cleaned up)** — cosmetic only, no functional impact, but removed for a
  clean repo.
- **A literal `src/{cartesia` artifact directory in `tts-service` (cleaned up)** —
  same category as above.

---

## Optional improvements — not blockers, worth doing eventually

- Add a CI workflow that runs `pnpm install --frozen-lockfile && pnpm build && pnpm
  test` on every PR — currently there's no CI config in this repo at all, so the
  lockfile/build/test suite has only ever been checked ad hoc.
- `apps/web`'s `Dockerfile` exists but isn't used by the Vercel deployment path
  (Vercel builds from source directly) — fine to keep for optional self-hosting, but
  worth a comment noting it's not the primary path.
- Tighten CORS to specific origins once your production dashboard domain is known.
- Consider adding a lightweight smoke-test script that hits every service's `/ready`
  after a deploy and fails loudly if any dependency check is red.

---

## Exact deployment order

### 0. One-time setup
1. In a Codespace (real network access): `pnpm install`, commit `pnpm-lock.yaml`.
2. Provision infrastructure:
   - **Neon**: create a Postgres project. Copy both the **pooled** connection string
     (→ `DATABASE_URL`) and the **direct/unpooled** one (→ `DATABASE_URL_UNPOOLED`).
   - **Redis**: Railway's Redis plugin, or Upstash. One instance is enough — every
     service reads the same `REDIS_URL`/`EVENT_BUS_REDIS_URL` (can be equal).
   - **Qdrant**: Qdrant Cloud (or self-hosted) → `QDRANT_URL` + `QDRANT_API_KEY`.
   - **LiveKit**: LiveKit Cloud project → `LIVEKIT_URL`, `LIVEKIT_API_KEY`,
     `LIVEKIT_API_SECRET`. Register `https://<voice-gateway-public-url>/webhooks/livekit`
     as the project's webhook URL in LiveKit's dashboard.
   - **Deepgram** and **Cartesia**: API keys from each provider's dashboard.
3. Run migrations once, against `DATABASE_URL_UNPOOLED`:
   ```bash
   pnpm --filter @zarax/database migrate:deploy
   ```
4. Generate every `INTERNAL_SERVICE_TOKEN` / `*_SERVICE_ACCOUNT_TOKEN` value up
   front (32+ random characters each — `openssl rand -hex 32` works well). Every
   service sharing a given shared-secret token (e.g. stt-service, tts-service, and
   tool-executor's own `INTERNAL_SERVICE_TOKEN`, or a caller/callee pair for a
   `*_SERVICE_ACCOUNT_TOKEN`) must be configured with the *same* value.

### 1. Deploy backend services to Railway (one Railway project, one service per app)
For each service below, in Railway: create a service, set **Root Directory to the
repo root** (not the service subfolder — the Dockerfiles need the whole monorepo as
build context for `turbo prune`), and point **Dockerfile Path** at the path shown.
The `railway.json` already committed in each service's folder supplies the
healthcheck/restart config once Railway's "Config Path" setting points at it.

Deploy in this order (later ones call earlier ones, though every service boots
fine regardless of order — this order just means things work correctly the first
time you use them, not just that they start):

1. `services/stt-service` (Dockerfile: `services/stt-service/Dockerfile`) — needs
   only `DEEPGRAM_API_KEY` + its own `INTERNAL_SERVICE_TOKEN`.
2. `services/tts-service` (`services/tts-service/Dockerfile`) — needs only
   `CARTESIA_API_KEY` + its own `INTERNAL_SERVICE_TOKEN`.
3. `services/tool-executor` (`services/tool-executor/Dockerfile`)
4. `services/rag-service` (`services/rag-service/Dockerfile`)
5. `services/llm-orchestrator` (`services/llm-orchestrator/Dockerfile`) — needs
   `RAG_SERVICE_ACCOUNT_TOKEN` and `TOOL_EXECUTOR_INTERNAL_SERVICE_TOKEN` (values
   from the seed script / matching tool-executor's `INTERNAL_SERVICE_TOKEN`).
6. `services/api` (`services/api/Dockerfile`) — needs
   `LLM_ORCHESTRATOR_SERVICE_ACCOUNT_TOKEN` and
   `TOOL_EXECUTOR_INTERNAL_SERVICE_TOKEN`.
7. `services/workflow-engine` (`services/workflow-engine/Dockerfile`) — needs both
   `LLM_ORCHESTRATOR_SERVICE_ACCOUNT_TOKEN` and `RAG_SERVICE_ACCOUNT_TOKEN`.
8. `apps/voice-gateway` (`apps/voice-gateway/Dockerfile`)

After services/api is up and you've signed up (creating your first tenant), run the
seed script (step 0.3 above needs a real tenant id, which only exists now):
```bash
pnpm db:seed-service-accounts --tenant-id=<your-tenant-id>
```
Then set the printed tokens into `services/api`, `services/workflow-engine`, and
`services/llm-orchestrator`'s Railway env vars and redeploy those three.

### 2. Deploy the dashboard to Vercel
1. Import the repo into Vercel. Set **Root Directory** to `apps/web`.
2. Set env vars: `BACKEND_URL` and `RAG_SERVICE_URL` pointing at the Railway-provided
   public URLs for `services/api` and `services/rag-service`, plus every other var in
   `apps/web/.env.example`.
3. `apps/web/vercel.json` handles the monorepo install/build commands
   (`cd ../.. && pnpm install`, `cd ../.. && pnpm turbo run build
   --filter=@zarax/web...`) — if Vercel's dashboard settings override these, mirror
   the same commands there instead.

### 3. Verify
- Hit `/ready` on every backend service's public/internal URL — every indicator
  should report healthy.
- Sign up through the deployed dashboard, create an agent, publish it, use "Test
  Agent" — this exercises the full services/api → llm-orchestrator → (rag-service)
  chain end to end.
- A real inbound/outbound phone call will **not** work yet — see blocker #2 above.
