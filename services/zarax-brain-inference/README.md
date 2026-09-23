# Zarax Brain Inference

Self-hosted, Zarax-controlled LLM inference service — Phase 1 of the
Anthropic-removal migration. Runs Qwen3-8B under vLLM on a Modal GPU
container, exposed behind an OpenAI-compatible API so `@zarax/ai-sdk`'s
`SelfHostedProvider` (which extends `OpenAiProvider`) needs no custom
integration code.

**Status: implementation complete, NOT deployed, NOT live-tested.** This
sandbox has no Modal CLI or credentials. Everything below has been verified
by code-level inspection against `SelfHostedProvider` / `OpenAiProvider`'s
actual behavior, not by running it.

## Architecture

Zarax Web/API → LLM Orchestrator → SelfHostedProvider → Zarax Brain Inference → vLLM → Qwen3-8B

Inside the Modal container: vLLM runs as a background subprocess bound to
`127.0.0.1:8001` (not publicly exposed). A small FastAPI app, mounted via
Modal's `@modal.asgi_app()`, is the only public surface — it serves
`/health` and `/ready` directly, and reverse-proxies everything under
`/v1/*` (streaming-capable) straight through to vLLM.

This two-layer design (rather than exposing vLLM's own server directly) is
what makes a custom `/health` + `/ready` contract possible, matching the
convention already used by `services/zarax-clone-inference`.

## Model

- **Model:** `Qwen/Qwen3-8B` (Apache 2.0 license)
- **Served as:** `zarax-brain-qwen3-8b` — this exact string is what you put
  in an Agent's `config.model` field to route that agent to this service
  (see `AgentRuntimeConfig.model` in `services/llm-orchestrator`).
- **Context window:** 32,768 tokens (native; not using YaRN extension)
- **GPU:** A10G (24GB) — Qwen3-8B at FP16 needs ~16-18GB, plus KV-cache
  headroom, so A10G is used directly rather than a T4.
- **Hindi/Hinglish quality: NOT confirmed.** Qwen3's docs say "100+
  languages and dialects" without an itemized list. Do not claim proven
  Hindi quality until this is deployed and a human reviews real output.

## Required environment variables / secrets

| Name | Where | Purpose |
|---|---|---|
| `SELF_HOSTED_LLM_API_KEY` | Modal secret `zarax-brain-secret` | Passed to vLLM's `--api-key` flag. Also set as the same value in `llm-orchestrator`'s Railway environment so `SelfHostedProvider` authenticates correctly. This is Zarax's own internal service token — not a vendor credential. |
| `SELF_HOSTED_LLM_BASE_URL` | `llm-orchestrator`'s Railway environment | Set to `https://<your-app>--web.modal.run/v1` (note the trailing `/v1` — required because the `openai` npm SDK appends `/chat/completions` etc. directly onto `baseURL`). |

Both of these are already wired into `packages/ai-sdk/src/module/ai-sdk.module.ts`
and `services/llm-orchestrator/src/app.module.ts` from the prior migration
batch — nothing on the TypeScript side needs to change for this service to
start working once deployed.

## Deployment (manual — needs real Modal account access)

Step 1. One-time: create the secret holding the internal auth token.

modal secret create zarax-brain-secret SELF_HOSTED_LLM_API_KEY=$(openssl rand -hex 32)

Step 2. Deploy.

modal deploy services/zarax-brain-inference/modal_app.py

Step 3. Modal prints a URL like https://<workspace>--zarax-brain-inference-web.modal.run
Verify it (see "Manual verification" below), then in Railway set, on the
llm-orchestrator service:
SELF_HOSTED_LLM_BASE_URL = https://<that-url>/v1
SELF_HOSTED_LLM_API_KEY  = <the same token generated in step 1>

Pin `MODEL_REVISION` in `modal_app.py` to a specific HF commit SHA before a
real production deploy (currently `"main"`, which can drift).

## API contract

Standard OpenAI Chat Completions wire protocol, exactly what `OpenAiProvider`
(via the official `openai` npm SDK) already speaks:

- `POST /v1/chat/completions` — `{model, messages, tools?, max_tokens?, temperature?, stream?}`
  - Non-streaming: standard OpenAI completion JSON (`choices[0].message`, `usage`, etc.)
  - Streaming (`stream: true`): server-sent chunked JSON exactly as vLLM emits it — proxied through unbuffered.
  - Tool calls: vLLM started with `--enable-auto-tool-choice --tool-call-parser hermes` (Qwen3's tool-call format), matching `toOpenAiTools()` / `extractToolCalls()` in `openai.provider.ts`.
- `GET /health` — `{"status": "ok", "service": "zarax-brain-inference", "version": "1.0.0"}`. No auth. Liveness only — does not imply the model is loaded.
- `GET /ready` — `200 {"ready": true, "model": "zarax-brain-qwen3-8b", ...}` once vLLM has finished loading the model onto the GPU; `503 {"code": "MODEL_NOT_READY", "message": "..."}` while still starting/loading. No auth.

## Authentication

`Authorization: Bearer <SELF_HOSTED_LLM_API_KEY>`, enforced entirely by
vLLM's own `--api-key` flag on `/v1/*` routes (the proxy layer forwards the
header as-is and does not re-check it — a single source of truth avoids the
two checks drifting apart). This is the exact scheme the `openai` npm SDK
sends automatically, so `SelfHostedProvider` requires no special auth code.
`/health` and `/ready` are intentionally unauthenticated (pure liveness /
readiness probes, no prompt or completion content ever passes through them).

## Manual verification checklist (not executed here — no Modal access)

Check 1:
curl https://<your-app>/health
expect: 200 {"status":"ok",...}

Check 2:
curl https://<your-app>/ready
expect: 503 while cold-starting, then 200 once the model is loaded

Check 3:
curl -X POST https://<your-app>/v1/chat/completions -H "Authorization: Bearer WRONG_TOKEN" -H "Content-Type: application/json" -d '{"model":"zarax-brain-qwen3-8b","messages":[{"role":"user","content":"hi"}]}'
expect: 401/403

Check 4:
curl -X POST https://<your-app>/v1/chat/completions -H "Authorization: Bearer $SELF_HOSTED_LLM_API_KEY" -H "Content-Type: application/json" -d '{"model":"zarax-brain-qwen3-8b","messages":[{"role":"user","content":"Reply with exactly: pong"}],"max_tokens":20}'
expect: 200, choices[0].message.content contains "pong"

Or run `tests/smoke_test.py` in this directory, which automates the above
four checks against a live deployment.

## What this does NOT do

- Does not deploy anything (no Modal credentials in this environment).
- Does not change `DEFAULT_LLM_PROVIDER` anywhere — production still uses
  Anthropic exclusively until someone explicitly flips that after Test A-H
  pass against a real deployment.
- Does not add an automatic fallback from `self-hosted` to `anthropic` or
  vice versa — `AgentRuntimeConfig.fallbackProviders` defaults to
  `['openai']` and is untouched.
- Does not touch Interface A (`apps/web/.../chat/route.ts`), TTS/STT/voice
  cloning paths, or any other production code outside this directory.
  
