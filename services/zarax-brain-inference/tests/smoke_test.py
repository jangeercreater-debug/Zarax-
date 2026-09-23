"""
Zarax Brain Inference — post-deploy smoke test.

NOT RUN as part of this implementation task — no Modal deployment exists yet
in this sandbox. This script is meant to be run manually, once, immediately
after `modal deploy services/zarax-brain-inference/modal_app.py`, by whoever
has real Modal account access, to get an honest pass/fail signal before
wiring SELF_HOSTED_LLM_BASE_URL into any environment.

Usage:
    pip install httpx
    ZARAX_BRAIN_URL=https://<your-app>.modal.run \
    ZARAX_BRAIN_TOKEN=<the SELF_HOSTED_LLM_API_KEY you set on the Modal secret> \
    python services/zarax-brain-inference/tests/smoke_test.py

Exit code 0 = all checks passed. Non-zero = something failed (printed).
This performs real HTTP calls; it does not invent or assume results.
"""

import os
import sys
import time

import httpx

BASE_URL = os.environ.get("ZARAX_BRAIN_URL", "").rstrip("/")
TOKEN = os.environ.get("ZARAX_BRAIN_TOKEN", "")
MODEL_NAME = "zarax-brain-qwen3-8b"


def fail(msg: str) -> None:
    print(f"FAIL: {msg}")
    sys.exit(1)


def main() -> None:
    if not BASE_URL:
        fail("ZARAX_BRAIN_URL not set.")
    if not TOKEN:
        fail("ZARAX_BRAIN_TOKEN not set.")

    print(f"Target: {BASE_URL}")

    # 1. Liveness
    r = httpx.get(f"{BASE_URL}/health", timeout=10)
    if r.status_code != 200:
        fail(f"/health returned {r.status_code}: {r.text}")
    print("PASS: /health returned 200")

    # 2. Readiness — poll for up to 5 minutes (cold start can take a while
    #    the first time, since the model has to download and load onto the GPU).
    print("Polling /ready (model may still be downloading/loading — can take minutes on cold start)...")
    ready = False
    deadline = time.time() + 300
    while time.time() < deadline:
        r = httpx.get(f"{BASE_URL}/ready", timeout=10)
        if r.status_code == 200:
            ready = True
            print(f"PASS: /ready returned 200: {r.json()}")
            break
        time.sleep(10)
    if not ready:
        fail("/ready did not return 200 within 5 minutes.")

    # 3. Auth rejection — no token should be rejected, exactly like the
    #    official OpenAI SDK would encounter against a real OpenAI-compatible server.
    r = httpx.post(
        f"{BASE_URL}/v1/chat/completions",
        json={"model": MODEL_NAME, "messages": [{"role": "user", "content": "hi"}]},
        timeout=15,
    )
    if r.status_code not in (401, 403):
        fail(f"Unauthenticated request expected 401/403, got {r.status_code}: {r.text}")
    print(f"PASS: unauthenticated request correctly rejected ({r.status_code})")

    # 4. Real completion with the correct token — exact call shape
    #    SelfHostedProvider/OpenAiProvider will make via the openai npm SDK.
    r = httpx.post(
        f"{BASE_URL}/v1/chat/completions",
        headers={"Authorization": f"Bearer {TOKEN}"},
        json={
            "model": MODEL_NAME,
            "messages": [{"role": "user", "content": "Reply with exactly the word: pong"}],
            "max_tokens": 20,
        },
        timeout=60,
    )
    if r.status_code != 200:
        fail(f"Authenticated chat completion failed: {r.status_code}: {r.text}")
    body = r.json()
    content = body.get("choices", [{}])[0].get("message", {}).get("content", "")
    print(f"PASS: authenticated chat completion succeeded. Model replied: {content!r}")

    print("\nAll smoke checks passed. This does NOT validate Hindi/Hinglish quality —")
    print("run the migration's Test A-H separately with human-reviewed output.")


if __name__ == "__main__":
    main()
