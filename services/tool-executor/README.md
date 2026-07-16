# @zarax/tool-executor

Securely executes external tool/API actions decided by the LLM — CRM, calendar,
WhatsApp, payments, and future MCP tools. This is the **only** service that holds
third-party action credentials, per the architecture's security boundary (see
`/docs/architecture.md`): the LLM decides *what* to do via function-calling;
`llm-orchestrator` never has direct network access to execute it.

Entirely event-bus-driven — no public HTTP API beyond `/health`, `/ready`, `/metrics`.

## Flow

```
llm-orchestrator → publishes tool.execution_requested (event-bus)
tool-executor     → looks up the tool by name (ToolRegistryService)
                  → validates arguments against the tool's own zod schema
                  → looks up the calling Agent's config (for per-tool settings,
                     e.g. a notification webhook URL)
                  → executes the tool's handler
                  → publishes tool.execution_completed (success or failure), same
                     requestId/correlationId, back on the event bus
llm-orchestrator  ← resolves the pending request it's waiting on (see its
                     ToolCallBroker) and continues the conversation
```

## Built-in tools (this milestone)

| Tool | External call? | Description |
|------|----------------|--------------|
| `get_current_datetime` | No | Pure computation — current date/time, optional timezone |
| `end_call` | No | Returns a structured decision signal; llm-orchestrator acts on it (tool-executor doesn't own call lifecycle) |
| `send_webhook_notification` | Yes | POSTs to the calling Agent's configured `webhooks.notification` URL — the one real outbound HTTP call in this set, wrapped in `ResilientHttpClient` |

Real CRM/calendar/WhatsApp/payment integrations are added the same way: a new
`ToolDefinition` registered in `ToolsModule`, with its own credentials/config and its
own `ResilientClient`/`ResilientHttpClient` wrapping — no changes needed to
`ToolExecutionConsumer` or the event contract.

## Security notes

- Every tool's arguments are validated against its own zod schema **before** execution
  — the LLM's function-calling output is never trusted as-is.
- An unknown tool name or a validation failure produces a `status: 'failure'` completion
  event (with an error message), never an unhandled exception that could crash the
  consumer or silently drop the request.
- Per-tool external credentials/URLs come from the calling Agent's `config` (tenant-
  scoped via `AgentRepository`, which extends `TenantScopedRepository`) — never global
  environment variables shared across tenants.

## Local development

```bash
cp .env.example .env
pnpm --filter @zarax/database migrate:dev
pnpm --filter @zarax/tool-executor dev
```

## Docker

```bash
docker build -f services/tool-executor/Dockerfile -t zarax-tool-executor .
```
