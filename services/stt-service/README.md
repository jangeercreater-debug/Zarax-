# @zarax/stt-service

Streaming and batch speech-to-text over Deepgram. Self-contained speech worker — no
database, Redis, or event-bus dependency; it does one job (audio in, text out) and is
called internally by other services (voice-gateway's future audio worker,
llm-orchestrator).

## Endpoints

| Protocol | Path              | Auth | Description |
|----------|-------------------|------|--------------|
| WS       | `/transcription`  | `?token=<INTERNAL_SERVICE_TOKEN>` query param | Real-time streaming: client sends raw linear16 PCM audio frames, receives JSON transcript frames back |
| POST     | `/transcribe`     | `X-Internal-Token` header | Batch/pre-recorded transcription — multipart file upload, returns the full transcript |
| GET      | `/health`, `/ready`, `/metrics` | none | From `@zarax/shared-observability` |

Both are guarded by the same shared secret rather than the full `@zarax/shared-auth`
Principal/RBAC system — this service is never reachable by end clients, only by other
internal services on the private network, so a shared token is the right amount of
protection for the blast radius involved.

## WebSocket protocol

```
Connect: wss://.../transcription?token=<INTERNAL_SERVICE_TOKEN>&callId=<uuid>
→ (binary frames) raw linear16 PCM audio, 16kHz mono
← (text frames)   {"type":"transcript","text":"...","isFinal":bool,"confidence":number}
                   {"type":"error","message":"..."}
```

The WebSocket server attaches directly to the underlying HTTP server's `upgrade` event
(`noServer: true` + manual `handleUpgrade`) rather than using Nest's `@WebSocketGateway`
socket.io abstraction — raw binary audio framing doesn't fit socket.io's JSON-event
model, and this approach keeps the audio path zero-copy.

## Why readiness doesn't open a real Deepgram connection

`/ready`'s Deepgram indicator only checks that `DEEPGRAM_API_KEY` is configured, not that
Deepgram itself is reachable — opening (and tearing down) a live transcription socket on
every orchestrator health poll would be wasteful and look like abuse at scale. A real
Deepgram outage shows up in error-rate metrics instead.

## Local development

```bash
cp .env.example .env
pnpm --filter @zarax/stt-service dev
```

## Docker

```bash
docker build -f services/stt-service/Dockerfile -t zarax-stt-service .
```
