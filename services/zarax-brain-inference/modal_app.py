"""
Zarax Brain Inference Service — Modal GPU
==========================================
Phase 1 of the Anthropic-removal migration: self-hosted/open-source LLM
inference, under Zarax's own control, behind an OpenAI-compatible wire
protocol so the existing @zarax/ai-sdk SelfHostedProvider (packages/ai-sdk/
src/providers/self-hosted.provider.ts, which extends OpenAiProvider and uses
the official `openai` npm SDK) needs zero custom request/response mapping
code — it already speaks this exact protocol.

STATUS: Implementation complete. NOT DEPLOYED and NOT LIVE-TESTED — this
sandbox has no Modal CLI / credentials (`modal` command not found, no
MODAL_TOKEN env). Deploying, health-checking and load-testing this against a
real GPU is the next concrete step, done by someone with actual Modal account
access. See README.md in this directory for the exact deploy commands and a
manual verification checklist. Do NOT treat this file as "tested" — only as
"complete and internally consistent with the existing SelfHostedProvider
contract," verified by static/code-level inspection only.

--------------------------------------------------------------------------
WHY THIS FILE LOOKS DIFFERENT FROM THE FIRST DRAFT
--------------------------------------------------------------------------
The earlier version of this file exposed vLLM's own built-in OpenAI-
compatible server directly via `@modal.web_server` (a raw port passthrough).
That gave zero room for:
  - A custom `/health` + `/ready` contract matching the convention already
    used by services/zarax-clone-inference/modal_app.py (structured JSON,
    model-loaded flag, 503 while warming up) — required by migration item #6.
  - Enforcing our own request logging discipline (never log prompt/response
    content) at the edge, independent of vLLM's own flags.

This version instead runs vLLM as a background subprocess bound to an
internal-only port (127.0.0.1:8001) and puts a small FastAPI app in front of
it via `@modal.asgi_app()`, which is Modal's mechanism for serving an
arbitrary custom ASGI app (unlike `@modal.fastapi_endpoint`, which only maps
one Python function to one route — a full reverse proxy needs a catch-all
route, which requires the more general `asgi_app` primitive).

Public surface (single Modal URL):
  GET  /health              — liveness only, no auth (matches
                               zarax-clone-inference's /health convention)
  GET  /ready                — checks vLLM's own internal /health; 200 + model
                               info once warm, 503 with a structured body
                               while the model is still loading
  ANY  /v1/{path:path}       — transparent reverse proxy to vLLM's own
                               OpenAI-compatible server (streaming-capable).
                               Auth (Bearer token) is enforced by vLLM itself
                               via its `--api-key` flag — this is the exact
                               scheme the official `openai` npm SDK sends, so
                               no separate auth layer is added here to avoid
                               two sources of truth for the same check.

Model: Qwen/Qwen3-8B (Apache 2.0 license — confirmed via HuggingFace model
  card at the time this was written).
  - Chosen for: Apache 2.0 (commercially unrestricted), native tool-calling
    support (required per migration spec section 8/12 — llm-orchestrator's
    OpenAiProvider.complete() always sends `tools` when the caller supplies
    them), 32K native context, runs on a single mid-size GPU.
  - NOT CONFIRMED: Hindi is not explicitly itemized in Qwen3's official
    supported-language docs ("100+ languages and dialects", no per-language
    list). Do NOT claim proven Hindi/Hinglish quality until this model is
    actually deployed and a human evaluates real output — same "no invented
    ratings" discipline already applied to the Chatterbox Hindi TTS work.
  - Served under the fixed name "zarax-brain-qwen3-8b" (see
    SERVED_MODEL_NAME below) rather than the raw HF path — this is the exact
    string to put in an Agent's `config.model` field (see README.md).

GPU: A10G (24GB) — Qwen3-8B at FP16 needs ~16-18GB; tight-to-unsafe on a
  16GB T4 once KV-cache/batching headroom is added, so A10G is used directly.

IMPORTANT:
- Modal provides GPU infrastructure ONLY — same principle as
  zarax-clone-inference: no third-party proprietary AI API is used here,
  this is Zarax's own inference server running an open-weight model Zarax
  controls end-to-end.
- Authentication: SELF_HOSTED_LLM_API_KEY (from the zarax-brain-secret Modal
  secret) is passed to vLLM's own `--api-key` flag, so vLLM itself rejects
  unauthenticated /v1/* requests before they reach the model. /health and
  /ready are intentionally unauthenticated (liveness/readiness probes only —
  they leak no prompt content, no completions, nothing beyond "is this
  container up").
- Never log: full prompts/completions, tokens/secrets. vLLM's own access log
  is disabled below (`--disable-log-requests`) for this reason, and the
  proxy layer in this file logs only method/path/status/latency — never
  request or response bodies.
"""

import modal

app = modal.App("zarax-brain-inference")

# The exact string that must be set in an Agent's config.model field
# (AgentRuntimeConfig.model, in services/llm-orchestrator) to route to this
# service. Pinned explicitly via vLLM's --served-model-name so it never
# silently changes if the underlying HF model path changes.
SERVED_MODEL_NAME = "zarax-brain-qwen3-8b"

MODEL_NAME = "Qwen/Qwen3-8B"
MODEL_REVISION = "main"  # TODO before production deploy: pin to a specific commit SHA.

VLLM_INTERNAL_PORT = 8001  # Not exposed publicly — only the FastAPI proxy below is.

model_volume = modal.Volume.from_name("zarax-brain-models", create_if_missing=True)
zarax_secret = modal.Secret.from_name("zarax-brain-secret")  # must provide SELF_HOSTED_LLM_API_KEY

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "vllm==0.6.6",
        "huggingface_hub[hf_transfer]>=0.26.0",
        "fastapi[standard]>=0.111.0",
        "httpx>=0.27.0",
    )
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1", "HF_HOME": "/models/hf_cache"})
)


@app.cls(
    gpu="A10G",
    image=image,
    volumes={"/models": model_volume},
    secrets=[zarax_secret],
    scaledown_window=1800,
    timeout=600,
    max_containers=3,
)
@modal.concurrent(max_inputs=32)  # vLLM handles request batching internally
class ZaraxBrainInference:

    @modal.enter()
    def start_vllm(self):
        """
        Launches vLLM as a background subprocess on start-up. Deliberately
        non-blocking (Popen, not subprocess.run) — Modal's own container
        start-up should not hang on model load; instead /ready reports
        "not ready yet" (503) until vLLM's own internal /health responds,
        exactly mirroring the model_loaded flag pattern in
        zarax-clone-inference/modal_app.py's @modal.enter() handler.
        """
        import logging
        import os
        import subprocess

        logging.basicConfig(level=logging.INFO)
        self.logger = logging.getLogger("zarax-brain-inference")

        api_key = os.environ.get("SELF_HOSTED_LLM_API_KEY", "")
        if not api_key:
            raise RuntimeError(
                "SELF_HOSTED_LLM_API_KEY not set in zarax-brain-secret — refusing to "
                "start an unauthenticated inference endpoint (see migration spec "
                "section 14: 'Do not expose an unauthenticated LLM inference endpoint')."
            )

        os.makedirs("/models/hf_cache", exist_ok=True)
        self.logger.info(f"Starting vLLM for {MODEL_NAME} (served as '{SERVED_MODEL_NAME}')...")

        self._vllm_process = subprocess.Popen(
            [
                "vllm",
                "serve",
                MODEL_NAME,
                "--revision", MODEL_REVISION,
                "--served-model-name", SERVED_MODEL_NAME,
                "--host", "127.0.0.1",
                "--port", str(VLLM_INTERNAL_PORT),
                "--api-key", api_key,
                "--max-model-len", "32768",
                "--disable-log-requests",  # never log prompt/response content
                "--enable-auto-tool-choice",
                "--tool-call-parser", "hermes",  # Qwen3 uses the Hermes-style tool-call format
            ]
        )
        self.logger.info(f"vLLM subprocess launched (pid={self._vllm_process.pid}).")

    @modal.exit()
    def stop_vllm(self):
        proc = getattr(self, "_vllm_process", None)
        if proc is not None and proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except Exception:
                proc.kill()

    @modal.asgi_app()
    def web(self):
        """
        Builds the public-facing FastAPI app: /health, /ready, and a
        streaming-capable reverse proxy for everything under /v1/*.

        A full custom ASGI app (rather than one-route-per-function via
        @modal.fastapi_endpoint) is required here specifically because a
        reverse proxy needs a catch-all path — vLLM's OpenAI-compatible
        server exposes several routes under /v1/ (chat/completions,
        completions, models, ...) and SelfHostedProvider/OpenAiProvider only
        ever call /v1/chat/completions today, but pinning the proxy to that
        one path would silently break if a future caller used /v1/models or
        streaming completions differently.
        """
        import httpx
        from fastapi import FastAPI, Request
        from fastapi.responses import JSONResponse, StreamingResponse

        web_app = FastAPI(title="zarax-brain-inference")
        internal_base = f"http://127.0.0.1:{VLLM_INTERNAL_PORT}"

        @web_app.get("/health")
        async def health():
            # Liveness only — does not check the model, matches the
            # zarax-clone-inference /health convention exactly.
            return {"status": "ok", "service": "zarax-brain-inference", "version": "1.0.0"}

        @web_app.get("/ready")
        async def ready():
            # Readiness — checks vLLM's own internal health endpoint. vLLM
            # does not start accepting connections until the model is fully
            # loaded onto the GPU, so "internal port responds" is an
            # accurate proxy for "model is loaded and can serve requests".
            try:
                async with httpx.AsyncClient(timeout=3.0) as client:
                    resp = await client.get(f"{internal_base}/health")
                if resp.status_code == 200:
                    return {
                        "ready": True,
                        "model": SERVED_MODEL_NAME,
                        "hf_model": MODEL_NAME,
                        "license": "Apache-2.0",
                        "context_window": 32768,
                    }
            except Exception:
                pass
            return JSONResponse(
                status_code=503,
                content={
                    "code": "MODEL_NOT_READY",
                    "message": "Qwen3-8B / vLLM is still starting or loading onto the GPU.",
                },
            )

        # httpx.AsyncClient is created once per container (not per-request) so
        # connections to the internal vLLM port are pooled/reused.
        proxy_client = httpx.AsyncClient(timeout=120.0)

        @web_app.api_route("/v1/{path:path}", methods=["GET", "POST"])
        async def proxy_v1(path: str, request: Request):
            """
            Transparent reverse proxy to vLLM's own OpenAI-compatible server.
            Streams the response through unbuffered so `stream: true` chat
            completions (used by SelfHostedProvider.streamComplete, via the
            official openai npm SDK) work exactly as they would against
            vLLM directly. Auth is NOT re-checked here — the Authorization
            header is forwarded as-is and vLLM's own --api-key flag is the
            single source of truth for accept/reject, so there is only one
            place this logic can drift.
            """
            url = f"{internal_base}/v1/{path}"
            body = await request.body()
            headers = {
                k: v
                for k, v in request.headers.items()
                if k.lower() not in ("host", "content-length")
            }

            upstream_req = proxy_client.build_request(
                request.method, url, headers=headers, content=body, params=request.query_params
            )
            upstream_resp = await proxy_client.send(upstream_req, stream=True)

            return StreamingResponse(
                upstream_resp.aiter_raw(),
                status_code=upstream_resp.status_code,
                headers={
                    k: v
                    for k, v in upstream_resp.headers.items()
                    if k.lower() not in ("content-length", "transfer-encoding", "connection")
                },
                background=upstream_resp.aclose,
            )

        return web_app


# --- Deployment notes (NOT executed by this file — manual steps for whoever
#     has Modal account access; full walkthrough in README.md) -------------
#
# 1. modal secret create zarax-brain-secret SELF_HOSTED_LLM_API_KEY=<generate-a-strong-token>
# 2. modal deploy services/zarax-brain-inference/modal_app.py
# 3. Take the resulting https://<...>.modal.run URL, append /v1, set it as
#    SELF_HOSTED_LLM_BASE_URL in llm-orchestrator's environment (Railway),
#    and set SELF_HOSTED_LLM_API_KEY to the same token from step 1.
# 4. curl https://<...>.modal.run/health   (expect 200, no auth needed)
#    curl https://<...>.modal.run/ready    (expect 503 while warming, then 200)
# 5. Run the migration's Test A-H against DEFAULT_LLM_PROVIDER='self-hosted'
#    in a non-production environment first (per migration spec section 21 —
#    do not cut production traffic over before this).
# 6. Only after Test A-H pass with real, observed (not invented) results,
#    consider switching DEFAULT_LLM_PROVIDER in production.
