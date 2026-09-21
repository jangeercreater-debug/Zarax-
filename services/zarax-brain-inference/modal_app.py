"""
Zarax Brain Inference Service — Modal GPU
==========================================
Phase 1 of Anthropic-removal migration: self-hosted/open-source LLM inference,
under Zarax's own control, behind an OpenAI-compatible wire protocol so the
existing @zarax/ai-sdk SelfHostedProvider (packages/ai-sdk/src/providers/
self-hosted.provider.ts) needs zero custom request/response mapping code.

STATUS: NOT DEPLOYED. This file was written but never run — this sandbox has
no Modal CLI / credentials (`modal` command not found, no MODAL_TOKEN env).
Deploying and load-testing this is the next concrete step, done by someone
with actual Modal account access, before SELF_HOSTED_LLM_BASE_URL is set in
any environment or DEFAULT_LLM_PROVIDER is switched to 'self-hosted'.

Model: Qwen3-8B (Apache 2.0 license — confirmed via HuggingFace model card)
  - Chosen for: Apache 2.0 (commercially unrestricted), native tool-calling
    support (confirmed in official docs — required per migration spec section 8/12),
    32K native context (131K with YaRN), runs on a single mid-size GPU.
  - NOT CONFIRMED: Hindi is not explicitly listed in Qwen3's official supported-
    language docs (they state "100+ languages and dialects" without an itemized
    list). Do NOT claim proven Hindi/Hinglish quality until Test B/C/D from the
    migration's test plan are actually run against this deployed model and a
    human listens to/reads the output — same "no invented ratings" discipline
    already applied to the Chatterbox Hindi TTS diagnostic in this project.
  - Alternative worth evaluating in a follow-up (not selected here, not
    benchmarked): Indic-specific instruction-tuned models (e.g. Sarvam AI's
    releases) may have stronger native Hindi/Hinglish performance — untested,
    license/capability unverified in this pass, flagged for Phase 2 evaluation
    rather than guessed at here.

GPU: A10 (24GB) — matches the existing Chatterbox convention of "T4 (dev) /
  A10 (production)"; Qwen3-8B at FP16 needs ~16-18GB, which is tight-to-unsafe
  on a 16GB T4 with KV-cache/batching headroom, so A10 is used directly rather
  than repeating the T4-then-upgrade path.

Architecture: vLLM's built-in OpenAI-compatible server (`vllm serve`), run
  inside the Modal container via @modal.web_server — this is the officially
  documented Modal+vLLM deployment pattern, and it means the wire protocol
  (POST /v1/chat/completions, including tool_calls and streaming) is
  vLLM's own tested implementation, not something hand-rolled here.

IMPORTANT:
- Modal provides GPU infrastructure ONLY — same principle as
  zarax-clone-inference: no third-party proprietary AI API is used here, this
  is Zarax's own inference server running an open-weight model Zarax controls.
- Authentication: reuses the same pattern as zarax-clone-inference
  (ZARAX_CLONE_SERVICE_TOKEN) — here SELF_HOSTED_LLM_API_KEY, passed to vLLM's
  own `--api-key` flag so vLLM itself rejects unauthenticated requests before
  they reach the model.
- Never log: full prompts/conversation content, tokens/secrets. vLLM's default
  access log is disabled below for this reason (see `--disable-log-requests`).
"""

import modal

app = modal.App("zarax-brain-inference")

MODEL_NAME = "Qwen/Qwen3-8B"
MODEL_REVISION = "main"  # Pin to a specific commit SHA before production deploy.

model_volume = modal.Volume.from_name("zarax-brain-models", create_if_missing=True)
zarax_secret = modal.Secret.from_name("zarax-brain-secret")  # must provide SELF_HOSTED_LLM_API_KEY

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "vllm==0.6.6",
        "huggingface_hub[hf_transfer]>=0.26.0",
    )
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1", "HF_HOME": "/models/hf_cache"})
)


@app.function(
    gpu="A10G",
    image=image,
    volumes={"/models": model_volume},
    secrets=[zarax_secret],
    scaledown_window=1800,
    timeout=600,
    max_containers=3,
)
@modal.concurrent(max_inputs=32)  # vLLM handles request batching internally
@modal.web_server(port=8000, startup_timeout=300)
def serve():
    import os
    import subprocess

    api_key = os.environ.get("SELF_HOSTED_LLM_API_KEY", "")
    if not api_key:
        raise RuntimeError(
            "SELF_HOSTED_LLM_API_KEY not set in zarax-brain-secret — refusing to "
            "start an unauthenticated inference endpoint (see migration spec "
            "section 14: 'Do not expose an unauthenticated LLM inference endpoint')."
        )

    subprocess.Popen(
        [
            "vllm",
            "serve",
            MODEL_NAME,
            "--revision", MODEL_REVISION,
            "--host", "0.0.0.0",
            "--port", "8000",
            "--api-key", api_key,
            "--max-model-len", "32768",
            "--disable-log-requests",  # never log prompt/response content
            "--enable-auto-tool-choice",
            "--tool-call-parser", "hermes",  # Qwen3 uses the Hermes-style tool-call format
        ]
    )


# --- Deployment notes (NOT executed by this file — manual steps for whoever has
#     Modal account access) ---------------------------------------------------
#
# 1. `modal secret create zarax-brain-secret SELF_HOSTED_LLM_API_KEY=<generate-a-strong-token>`
# 2. `modal deploy services/zarax-brain-inference/modal_app.py`
# 3. Take the resulting https://<...>.modal.run URL, append /v1, set it as
#    SELF_HOSTED_LLM_BASE_URL in llm-orchestrator's environment (Railway),
#    and set SELF_HOSTED_LLM_API_KEY to the same token from step 1.
# 4. Run the migration's Test A-H against DEFAULT_LLM_PROVIDER='self-hosted'
#    in a non-production environment first (per migration spec section 21 —
#    do not cut production traffic over before this).
# 5. Only after Test A-H pass with real, observed (not invented) results,
#    consider switching DEFAULT_LLM_PROVIDER in production.
