# @zarax/workflow-engine

Executes workflows — walks the node graph the Voice Agent dashboard's visual editor
produces. Purely a background worker: no tenant-facing HTTP endpoints, only
`/health`/`/ready`/`/metrics`. Driven entirely by `services/api`, which owns the
CRUD/versioning/publish surface and enqueues a job every time a workflow runs (see
`services/api/README.md`'s Workflow endpoints table).

## Why a separate service, not part of services/api

Execution can involve LLM calls, HTTP calls, and (via the Delay node) waits up to 24
hours — none of that belongs in `services/api`, which stays a fast, stateless CRUD
API. Same reasoning as `rag-service`'s `DocumentProcessingService` living in its own
async worker rather than blocking an HTTP request. `services/workflow-engine` was
already a reserved path in the original monorepo layout (see `docs/architecture.md`).

## How a run works

```
services/api's WorkflowsService.execute()
  → creates a WorkflowExecution row (status: pending)
  → enqueues a job on the 'workflow-execution' queue (@zarax/job-queue)
  → returns immediately

WorkflowExecutionConsumer (this service)
  → loads the workflow's definition (graph of nodes + edges) and the execution row
  → walks the graph starting at the 'trigger' node (or resumeFromNodeId, if this is
    a continuation job after a Delay node)
  → for each node: looks up its NodeExecutor by type, executes it, appends the
    result to the execution's nodeExecutions log, merges its output into the
    shared context (so later nodes can reference {{nodeId.field}})
  → a 'condition' node's result picks the true/false outgoing edge
  → a 'delay' node returns pauseForMs instead of actually sleeping — the consumer
    re-enqueues a continuation job (a native BullMQ delayed job) and stops this
    invocation, rather than blocking a shared worker thread
  → reaching an 'end' node (or running off the graph) marks the execution completed
  → any node throwing marks the whole execution failed (not retried automatically —
    a workflow with side effects like a webhook already fired isn't safely retryable
    as a whole; see JobQueue({ attempts: 1 }) in the consumer)
```

## Node executors and what they reuse

| Node type | Executor | Reuses |
|---|---|---|
| `trigger` | `TriggerExecutor` | — (no-op; marks the run's start) |
| `ai_agent` | `AiAgentExecutor` | llm-orchestrator's real `/conversations/:id/turns` — same pipeline (tool loop, RAG, metering) `services/api`'s "Test Agent" reuses |
| `knowledge_base` | `KnowledgeBaseExecutor` | rag-service's real `/search` |
| `condition` | `ConditionExecutor` | — (pure logic: a small fixed set of operators, not an eval'd expression language) |
| `delay` | `DelayExecutor` | `@zarax/job-queue`'s delayed-job support (`add(..., { delayMs })`) |
| `webhook`, `http_request` | `HttpNodeExecutor` (shared) | `@zarax/resilience`'s `ResilientHttpClient` directly — **not** tool-executor's `send_webhook_notification` tool, whose URL comes from an Agent's config, not a workflow node's own configured URL; genuinely different concerns |
| `email` | `EmailExecutor` | — future-ready stub; no email provider is integrated anywhere in this project yet (same documented gap as `services/api`'s `AuthEmailService`) |
| `end` | `EndExecutor` | — (marks completion) |

## What's honestly not built

- **Event-based auto-triggering** — a trigger node's config can name an intended
  event type (e.g. `call.ended`), but there's no always-on listener that
  automatically starts a run when that event fires. Every run today is a manual
  "Test Workflow" / "Run now" call from the dashboard. Building a real
  event-subscription registry (which workflows listen to which event types, running
  continuously, de-duplicated) is a materially larger feature than this milestone's
  scope.
- **Full DAG joins/merges** — the graph walker supports linear flows with
  condition-based branching (one of two next edges), not arbitrary graphs where
  multiple branches merge back into a single downstream node with combined inputs.
- **Email sending** — see the table above.

## Local development

```bash
cp .env.example .env
pnpm --filter @zarax/workflow-engine dev
```

Requires `services/api`, `llm-orchestrator`, and `rag-service` running (or at least
reachable) for a real end-to-end run — a workflow with only `condition`/`delay` nodes
can run without any of them.
