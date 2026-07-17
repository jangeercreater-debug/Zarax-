# @zarax/api

Core domain service — tenants, users/auth, agents. This is the **reference NestJS
service** — every other service in `services/*` follows the same module structure,
bootstrap pattern, and shared-package wiring established here. It's also the reference
for every production standard in `docs/production-standards.md` (audit logs, rate
limiting, idempotency, OpenAPI, response envelope, versioning).

## Structure

```
src/
├── main.ts              # tracing → app bootstrap → middleware/filters/pipes → versioning/OpenAPI
├── app.module.ts         # wires every shared package (config, logger, auth, observability, event-bus, db, production standards)
├── config/
│   └── env.schema.ts      # this service's composed zod env schema
└── modules/
    ├── auth/               # signup / login / refresh
    ├── tenants/            # tenant read endpoints
    └── agents/             # agent CRUD, versioning, rollback
```

## Endpoints

All routes are versioned (`/v1/...`) except `/health`, `/ready`, `/metrics`, which stay
unversioned — see `docs/production-standards.md` item #3.

| Method | Path                                 | Auth | Description |
|--------|--------------------------------------|------|--------------|
| POST   | `/v1/auth/signup`                    | `@Public()` | Creates a tenant + its first (owner) user, returns tokens, sends a verification email |
| POST   | `/v1/auth/login`                     | `@Public()`, stricter rate limit (10/min) | Returns access + refresh tokens |
| POST   | `/v1/auth/refresh`                   | `@Public()` | Exchanges a refresh token for a new pair — validates and rotates the underlying session |
| POST   | `/v1/auth/logout`                    | `@Public()` | Revokes the session behind a refresh token |
| POST   | `/v1/auth/forgot-password`           | `@Public()`, rate limit (5/min) | Requests a password reset link (same response whether or not the email exists) |
| POST   | `/v1/auth/reset-password`            | `@Public()` | Resets the password with a token; revokes every existing session |
| POST   | `/v1/auth/verify-email`              | `@Public()` | Verifies an email address with a token |
| POST   | `/v1/auth/resend-verification`       | authenticated | Resends the verification email |
| POST   | `/v1/auth/switch-tenant`             | authenticated | Re-issues tokens scoped to a different organization the user belongs to |
| GET    | `/v1/tenants/me`                     | any authenticated principal | Current tenant's public info |
| GET/PATCH | `/v1/users/me`                    | authenticated | Get/update the current user's profile |
| POST   | `/v1/users/me/change-password`       | authenticated | Changes the password; revokes every *other* session |
| GET    | `/v1/users/me/tenants`               | authenticated | Every organization the user belongs to (org switcher data) |
| GET    | `/v1/users/me/sessions`              | authenticated | Active sessions for the current user |
| DELETE | `/v1/users/me/sessions/:id`          | authenticated | Revoke a specific session |
| POST   | `/v1/agents`                         | `agents:create` | Create a new agent — draft (`isActive: false`) by default; pass `publishOnCreate: true` to publish immediately |
| GET    | `/v1/agents`                         | `agents:read` | List the tenant's agents (drafts and published) |
| GET    | `/v1/agents/tools-catalog`           | `agents:read` | Real tool catalog proxied from tool-executor, for the builder's tool multi-select |
| GET    | `/v1/agents/feature-flags`           | `agents:read` | Voice-agent-related feature flags for the tenant (via `@zarax/feature-flags`) |
| GET    | `/v1/agents/:id`                     | `agents:read` | Get one agent |
| PATCH  | `/v1/agents/:id`                     | `agents:update` | Update name and/or config — a config change auto-creates a new version |
| DELETE | `/v1/agents/:id`                     | `agents:delete` | Soft-delete an agent |
| GET    | `/v1/agents/:id/versions`            | `agents:read` | List every version snapshot, newest first |
| POST   | `/v1/agents/:id/versions/:v/rollback`| `agents:update` | Roll back — creates a new version matching the target, never rewrites history |
| POST   | `/v1/agents/:id/publish`             | `agents:update` | Publish — requires a system prompt to be set; makes the agent reachable by real calls |
| POST   | `/v1/agents/:id/unpublish`           | `agents:update` | Revert to draft |
| POST   | `/v1/agents/:id/clone`               | `agents:create` | Duplicate into a new draft — fresh version history, never inherits publish state |
| POST   | `/v1/agents/:id/test`                | `agents:read`, rate limit (20/min) | Send a message through llm-orchestrator's **real** pipeline (tool loop, RAG, metering) — not persisted |
| POST   | `/v1/workflows`                      | `workflows:create` | Create a new workflow — draft by default |
| GET    | `/v1/workflows`                      | `workflows:read` | List the tenant's workflows |
| GET    | `/v1/workflows/:id`                  | `workflows:read` | Get one workflow |
| PATCH  | `/v1/workflows/:id`                  | `workflows:update` | Update name/description/definition — a definition change auto-creates a new version |
| DELETE | `/v1/workflows/:id`                  | `workflows:delete` | Soft-delete a workflow |
| POST   | `/v1/workflows/:id/publish`          | `workflows:update` | Publish — requires at least one trigger node and one end node |
| POST   | `/v1/workflows/:id/unpublish`        | `workflows:update` | Revert to draft |
| GET    | `/v1/workflows/:id/versions`         | `workflows:read` | List every version snapshot, newest first |
| POST   | `/v1/workflows/:id/versions/:v/rollback` | `workflows:update` | Roll back — creates a new version matching the target |
| POST   | `/v1/workflows/:id/execute`          | `workflows:execute`, rate limit (20/min) | Trigger a run (works for drafts too — this is "Test Workflow"); actual execution happens in `services/workflow-engine` |
| GET    | `/v1/workflows/:id/executions`       | `workflows:read` | List execution history, newest first |
| GET    | `/v1/workflows/:id/executions/:executionId` | `workflows:read` | Get one execution, including its per-node result log |
| GET    | `/health`, `/ready`, `/metrics`       | none | From `@zarax/shared-observability` |
| GET    | `/docs`                               | none | Auto-generated OpenAPI/Swagger UI |

## The Voice Agent Builder's draft/publish model

`Agent.isActive` doubles as the publish flag (`false` = draft, `true` = published) —
there's no separate status column, since the two concepts are the same thing. New
agents start as drafts. `AgentRepository.findByIdForTenantOrThrow()` (used by every
dashboard CRUD operation, and by "Test Agent") does **not** gate on `isActive` — a
draft is a completely normal, editable, testable agent, not "not found". Only
`AgentRepository.assertPublishedForTenant()` enforces "must be published", and it's
called from exactly one place: `voice-gateway`'s room creation — the actual entry
point a real caller reaches. Publishing itself requires a system prompt to be set
(`AgentsService.publish()`), so a live agent can't have empty/undefined behavior.
`WorkflowRepository`/`WorkflowsService.publish()` follow the identical pattern for
workflows (requiring a trigger + end node instead of a system prompt).

## "Test Agent" reuses the real pipeline — it doesn't reimplement it

`POST /agents/:id/test` calls llm-orchestrator's own `/conversations/:callId/turns`
endpoint via a small `LlmOrchestratorClient` (same shape as llm-orchestrator's own
`RagClient` — `ResilientHttpClient` + a `X-Service-Account-Token` header), using a
fresh random `callId` each time. Every test message goes through the exact same
tool-calling loop, RAG augmentation, and usage/cost metering a real call would — zero
duplicated business logic. **Operational note**: this requires a `ServiceAccount`
provisioned for services/api to call llm-orchestrator with (same pattern
`RAG_SERVICE_ACCOUNT_TOKEN` already requires for llm-orchestrator → rag-service) —
see `LLM_ORCHESTRATOR_SERVICE_ACCOUNT_TOKEN` in `.env.example`.

## Workflows — this service is the CRUD/trigger layer only

`services/api` owns workflow authoring (CRUD, versioning, publish/draft) and
*triggering* a run — it does not execute workflows itself. `WorkflowsService.execute()`
creates a `WorkflowExecution` row and enqueues a job on the `workflow-execution` queue
(`@zarax/job-queue`); `services/workflow-engine` is the consumer that actually walks
the node graph. See that service's own README for the full execution model (node
executors, the Delay node's non-blocking pause/resume, what's honestly not built yet).

## Session management, in one paragraph

Every login/signup creates a `UserSession` row and embeds its id in both the access and
refresh tokens (`sessionId` claim). `refresh` validates the session exists and isn't
revoked *and* rotates the stored refresh-token hash — a stolen, already-used refresh
token fails this check even if its JWT signature is still valid. `logout` revokes that
one session. `changePassword` revokes every *other* session (keeps you signed in on the
device you used to change it); `resetPassword` revokes *all* sessions (a password reset
implies possible compromise, so nothing should survive it). See
`packages/database`'s `UserSession` model and `UserSessionRepository`.

## Email delivery — what's real and what isn't

Password-reset and email-verification **tokens** are fully real (generated, hashed,
expiring, single-use). Actual **email delivery** isn't integrated yet — no provider
(SES, SendGrid, ...) is wired up. Every link is structured-logged, and outside
production the API response includes it directly (`devOnlyResetLink`,
`devOnlyVerificationLink`) so the whole flow is testable end-to-end today. See
`AuthEmailService` — swapping in a real provider only touches that one file.

## Agent versioning, in one paragraph

`Agent.config` (system prompt, provider, tools, RAG settings — see
`services/llm-orchestrator`'s `AgentRuntimeConfig`) is what gets versioned, not the
agent's display name. Every `PATCH .../agents/:id` that includes a `config` field
merges it shallowly over the existing config and snapshots the result as a new
`AgentVersion` row; a `name`-only PATCH never creates a version. Rollback creates a
*new* version whose config matches an old one — `GET .../versions` always reads as an
honest, linear, append-only history, never a rewritten past.

## Why some things are wired directly in `app.module.ts` instead of via DI

NestJS evaluates every `.forRoot()` dynamic-module call when `app.module.ts` is loaded —
before the DI container exists. `HealthModule.forRoot({ indicators })` needs a real
`PrismaClient`/`Redis` instance *at that point*, not a DI-injected one. So `app.module.ts`
builds those instances directly from `process.env` (not the validated `AppConfigService`,
which isn't available yet either) and re-exposes the same singleton instances through
`PrismaClientModule` for every other part of the app to inject normally. This is a
standard, unavoidable pattern for NestJS static module configuration — see the comment
block at the top of `app.module.ts`.

## Local development

```bash
cp .env.example .env   # then fill in real secrets
pnpm --filter @zarax/database migrate:dev
pnpm --filter @zarax/api dev
```

## Docker

Build from the **monorepo root** (Turborepo's prune step needs the full workspace):
```bash
docker build -f services/api/Dockerfile -t zarax-api .
```
