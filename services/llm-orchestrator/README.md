# @zarax/llm-orchestrator

Owns the conversation state machine for a voice session — the "brain" that turns a
transcript into a response, calling the LLM (via `@zarax/ai-sdk`, with automatic
fallback), dispatching tool calls to `tool-executor` over the event bus, and optionally
pulling context from `rag-service`.

## Endpoint

| Method | Path | Auth | Description |
|--------|------|------|--------------|
| POST | `/conversations/:callId/turns` | any authenticated principal | Submits one user utterance, returns the assistant's response text + whether the call should end |

This is the integration point a future voice-pipeline worker (the piece that actually
joins the LiveKit room and owns the raw audio tracks — noted as a later milestone in
`apps/voice-gateway`'s README) calls once per finalized STT transcript, and whose
response text it hands to `tts-service` for synthesis.

## The conversation loop

```
1. Load history (Redis, via ConversationStateService) — empty on a call's first turn
2. First turn only: seed the Agent's systemPrompt
3. If ragEnabled: search rag-service for context, inject as a system message
   (failure here degrades to "answer without extra context", never fails the turn)
4. Append the user's message
5. Loop (bounded by maxToolIterations):
     a. Call the LLM (AiProviderRegistry.get() or .completeWithFallback())
     b. No tool calls → this is the final answer, break
     c. Tool calls → for each, request execution via ToolCallBroker (event-bus
        request/reply — see below), append the result to history, loop again
6. Save updated history
7. Return { response, shouldEndCall, endCallReason }
```

## Agent config contract

`Agent.config` (free-form JSON in `@zarax/database`'s schema) is read as:

```ts
{
  systemPrompt?: string;
  provider?: 'anthropic' | 'groq' | 'openai' | 'gemini';
  fallbackProviders?: LLMProviderName[];
  model?: string;
  enabledTools?: string[];       // must match names from tool-executor's /tools catalog
  ragEnabled?: boolean;
  maxToolIterations?: number;    // default 5 — a safety valve against a runaway tool loop
  webhooks?: Record<string, string>;  // passed through to tool-executor untouched
}
```
All fields are optional with defaults (see `agent-runtime-config.ts`) — an Agent created
via a minimal API call still works.

## ToolCallBroker — request/reply over a fire-and-forget event bus

`@zarax/event-bus` is pub/sub, not RPC. `ToolCallBroker` publishes a
`tool.execution_requested` event with a unique `requestId`, then resolves a pending
promise when the matching `tool.execution_completed` event arrives — with a timeout so
a lost or slow `tool-executor` response never hangs a conversation turn forever.

## Why the tool catalog is fetched from tool-executor, not duplicated here

Tool *definitions* (name/description/JSON schema) live in `tool-executor` — duplicating
them here would mean redeploying both services every time a tool's schema changes.
`ToolCatalogClient` fetches `tool-executor`'s `/tools` endpoint instead (cached ~60s,
falling back to a stale cache rather than failing a turn over a transient blip).

## Local development

```bash
cp .env.example .env
pnpm --filter @zarax/database migrate:dev
pnpm --filter @zarax/llm-orchestrator dev
```

## Docker

```bash
docker build -f services/llm-orchestrator/Dockerfile -t zarax-llm-orchestrator .
```
