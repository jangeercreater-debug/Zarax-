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

```bash
# 1. One-time: create the secret holding the internal auth token.
modal secret create zarax-brain-secret \
  SELF_HOSTED_LLM_API_KEY=$(openssl rand -hex 32)

# 2. Deploy.
modal deploy services/zarax-brain-inference/modal_app.py

# 3. Modal prints a URL like https://<workspace>--zarax-brain-inference-web.modal.run
#    Verify it (see "Manual verification" below), then in Railway set, on the
#    llm-orchestrator service:
#      SELF_HOSTED_LLM_BASE_URL = https://<that-url>/v1
#      SELF_HOSTED_LLM_API_KEY  = <the same token generated in step 1>
