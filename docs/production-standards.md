# Production Infrastructure Standards

Cross-cutting standards every HTTP-exposing service adopts, established here and
demonstrated in full in `services/api` (the reference implementation every other
service's controllers/modules follow — see `services/api/README.md`).

| # | Standard | Implementation | Status |
|---|---|---|---|
| 1 | Structured audit logs | `@zarax/audit-log` — `@Audited()` decorator + `AuditInterceptor`, append-only `audit_log_entries` table | Wired in `services/api` (signup, login) |
| 2 | Feature flags | `@zarax/feature-flags` — `FeatureFlagService.isEnabled()`, override > default > percentage rollout, Redis-cached | Package complete; adopt per-feature as needed |
| 3 | API versioning | `applyApiVersioning(app)` (`@zarax/shared-observability`) — URI versioning, `/v1/...`, health/metrics version-neutral | Wired in `services/api` |
| 4 | Distributed rate limiting | `@zarax/api-standards` — `RateLimitGuard` + `@RateLimit()`, Redis fixed-window counter, keyed by tenant+principal | Wired in `services/api` |
| 5 | Write-endpoint idempotency | `@zarax/api-standards` — `IdempotencyInterceptor`, opt-in via `Idempotency-Key` header | Wired in `services/api` |
| 6 | Secret manager abstraction | `@zarax/shared-config` — `SecretsProvider` interface, `EnvSecretsProvider` default, swappable via `SecretsModule.forRoot({ provider })` | Package complete |
| 7 | Request/correlation ID propagation | `correlationIdMiddleware` (`@zarax/shared-logger`, built in M3) — already on every service; WS connections also propagate it (M6 hardening) | Already complete, verified |
| 8 | Standard response format | Success: `ResponseTransformInterceptor` → `{ data, requestId }`. Failure: `GlobalExceptionFilter` (built in M3) → `{ error: { code, message, requestId, details } }` | Wired in `services/api` |
| 9 | Auto-generated OpenAPI docs | `setupOpenApi(app, options)` (`@zarax/shared-observability`) — generates from existing decorators, served at `/docs` | Wired in `services/api`; DTOs there decorated with `@ApiProperty()` as the reference pattern |
| 10 | DB migration/rollback strategy | `docs/database-migrations.md` | Documented |

## Rollout plan for the other 6 services

`services/api` demonstrates the full stack. Rolling the same standards out to
`voice-gateway`, `stt-service`, `tts-service`, `llm-orchestrator`, `rag-service`,
`tool-executor` is mechanical (import the same modules, same `main.ts` additions) and
should happen incrementally rather than as one giant simultaneous change — internal-only
services (`stt-service`, `tts-service`, `tool-executor`, guarded by
`InternalTokenGuard`) have a much smaller blast radius and may reasonably skip #1
(audit logs) and #9 (OpenAPI docs, since they have no external consumers reading a
Swagger UI), applying only the ones that still matter for a machine-to-machine service:
#3 (versioning), #4 (rate limiting), #6 (secrets), #7 (already everywhere), #8
(response format).

---

## Batch 2 — reliability, cost, and data lifecycle

| # | Standard | Implementation | Status |
|---|---|---|---|
| 11 | Multi-region readiness | `docs/multi-region-readiness.md` | Documented — architecture assessment + roadmap, not implemented (no current data-residency requirement to design against) |
| 12 | Background job retry queues + DLQ | `@zarax/job-queue` — `JobQueue<T>` wraps BullMQ with automatic dead-letter handling | Package complete |
| 13 | Webhook retry with exponential backoff | `@zarax/job-queue`'s `WebhookDeliveryService`, built on #12 | Package complete |
| 14 | Provider cost tracking | `@zarax/metering` — `MeteringService.recordLlmUsage()` etc., pricing table in `pricing-table.ts` | Wired in `llm-orchestrator` (LLM calls); STT/TTS/RAG should adopt `recordSttUsage()`/`recordTtsUsage()`/`recordRagEmbeddingUsage()` the same way |
| 15 | Usage metering | Same `@zarax/metering` package — cost and usage share one `UsageEvent` table | Same as #14 |
| 16 | Soft delete | `deletedAt` on `Tenant`/`User`/`Agent`; every repository read filters it by default | Implemented for the 3 core entities; extend to any new business entity the same way |
| 17 | DB backup & disaster recovery | `docs/disaster-recovery.md` | Documented — runbook + RPO/RTO targets, not yet rehearsed |
| 18 | Data retention / GDPR readiness | `docs/data-retention-policy.md` | Documented — soft-delete groundwork in place; scheduled hard-delete purge job is the recommended next step |
| 19 | Agent versioning + rollback | `AgentRepository.createVersion()`/`listVersions()`/`rollbackToVersion()`, `AgentVersion` table | Implemented |
| 20 | Prompt version history + rollback | Covered by #19 — the system prompt lives inside `Agent.config`, which is what gets versioned | Implemented (via #19); a dedicated `Prompt`/`PromptVersion` model is the natural next step only if prompts become shared across multiple agents |

