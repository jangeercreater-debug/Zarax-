# @zarax/voice-gateway

Real-time voice ingress — LiveKit room/token management and webhook-driven call
lifecycle events. This is the control-plane side of voice calls; the actual per-call
audio worker (joining the room, streaming audio to `stt-service`, etc.) is built in a
later milestone once `llm-orchestrator` exists to consume transcripts.

## Endpoints

| Method | Path                | Auth | Description |
|--------|---------------------|------|--------------|
| POST   | `/rooms/token`       | `calls:create` permission | Verifies the agent, creates/ensures a LiveKit room, mints a join token |
| POST   | `/webhooks/livekit`  | LiveKit signature (not Principal auth) | Translates `room_started`/`room_finished` into `call.started`/`call.ended` events |
| GET    | `/health`, `/ready`, `/metrics` | framework-level | From `@zarax/shared-observability` |

## Call lifecycle flow

```
POST /rooms/token
  → verify Agent belongs to tenant (AgentRepository)
  → ensure LiveKit room exists (room name encodes tenantId/agentId/callId)
  → register pending call metadata in Redis (CallSessionService)
  → mint + return a LiveKit access token

[client joins the LiveKit room with that token]

LiveKit → POST /webhooks/livekit  (event: room_started)
  → verify signature (LiveKitWebhookVerifier)
  → parse tenantId back out of the room name
  → publish `call.started` on the event bus

LiveKit → POST /webhooks/livekit  (event: room_finished)
  → compute call duration from the registered start time
  → publish `call.ended` on the event bus
  → delete the Redis session record
```

## Why room names encode tenantId/agentId/callId

LiveKit's webhook payload only carries the room name — no tenant context. Encoding
`t_{tenantId}_a_{agentId}_c_{callId}` into the room name itself means the webhook
handler can always recover the tenant without an extra lookup table, and a wrong/garbled
room name simply fails to parse rather than silently resolving to the wrong tenant.

## Why no `Call` DB row is written here

`voice-gateway` only *witnesses* the call lifecycle (via LiveKit webhooks) and publishes
`call.started` / `call.ended` events — it does not write to the `calls` table directly.
Keeping a single writer for that table (a future event-bus consumer, likely in
`services/api` or `workflow-engine`) avoids two services racing to persist the same row.

## Local development

```bash
cp .env.example .env   # fill in real LiveKit/DB/Redis values
pnpm --filter @zarax/voice-gateway dev
```

## Docker

Build from the **monorepo root**:
```bash
docker build -f apps/voice-gateway/Dockerfile -t zarax-voice-gateway .
```
