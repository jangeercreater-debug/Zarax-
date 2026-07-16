# @zarax/tts-service

Text-to-speech over Cartesia AI. Self-contained speech worker, same shape as
`stt-service` — no database/Redis/event-bus dependency, guarded by the shared
`INTERNAL_SERVICE_TOKEN` rather than full Principal/RBAC (never reachable by end clients
directly).

## Endpoints

| Protocol | Path          | Auth | Description |
|----------|---------------|------|--------------|
| POST     | `/synthesize` | `X-Internal-Token` header | One-shot synthesis — returns a complete `audio/wav` buffer |
| WS       | `/synthesis`  | `?token=<INTERNAL_SERVICE_TOKEN>` query param | Streaming synthesis — raw PCM audio chunks as Cartesia produces them |
| GET      | `/health`, `/ready`, `/metrics` | none | From `@zarax/shared-observability` |

## Why no Cartesia SDK dependency

Cartesia's REST `/tts/bytes` endpoint is a single stable JSON-in/bytes-out call — wrapped
directly via Node's native `fetch` in `CartesiaRestClient` rather than pulling in an SDK,
avoiding one more third-party API surface to track for breaking changes. The streaming
path (`CartesiaStreamSession`) talks to Cartesia's WebSocket endpoint using the `ws`
library the same way `stt-service` talks to Deepgram's streaming API.

## WebSocket protocol

```
Connect:          wss://.../synthesis?token=<INTERNAL_SERVICE_TOKEN>
Client → server:  one JSON text frame — {"text":"...","voiceId":"..."}
Server → client:  binary frames = raw pcm_s16le audio chunks, then the socket closes
                   normally on completion, or sends {"type":"error",...} then closes on failure
```

Only a one-shot (full-transcript) streaming request is supported today — feeding
partial/incremental text as an LLM streams its response is a natural extension once
`llm-orchestrator` exists to drive it sentence-by-sentence for lower end-to-end latency.

## Local development

```bash
cp .env.example .env
pnpm --filter @zarax/tts-service dev
```

## Docker

```bash
docker build -f services/tts-service/Dockerfile -t zarax-tts-service .
```
