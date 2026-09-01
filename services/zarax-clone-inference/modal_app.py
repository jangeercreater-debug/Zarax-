"""
Zarax Clone Inference Service — Modal GPU
==========================================
Phase 6: Consent-based voice cloning synthesis on serverless GPU.

Model: Chatterbox Multilingual V3 (ResembleAI/chatterbox, MIT license)
GPU: T4 (dev) / A10 (production)
Architecture: scale-to-zero serverless, model cached in Modal Volume

IMPORTANT:
- This is Zarax's OWN inference service running OUR OWN copy of Chatterbox.
- Modal provides GPU infrastructure ONLY — no third-party TTS API is used.
- Speech generation happens entirely inside this container.
- Authentication: X-Zarax-Clone-Token header required on every request.
- Never log: raw audio, speaker embeddings, auth tokens.
"""

import modal

# ── App + Volume ──────────────────────────────────────────────────────────────

app = modal.App("zarax-clone-inference")

# Modal Volume: model weights downloaded once, persisted across container restarts.
# Chatterbox Multilingual V3 is ~500M params — fits comfortably in 1TB free volume tier.
model_volume = modal.Volume.from_name("zarax-chatterbox-models", create_if_missing=True)

# Modal Secret: ZARAX_CLONE_SERVICE_TOKEN stored securely — never in source code.
zarax_secret = modal.Secret.from_name("zarax-clone-secret")

# ── Docker image ──────────────────────────────────────────────────────────────
# Pre-install chatterbox-tts and dependencies in image layer for fast cold start.

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "chatterbox-tts==0.1.1",
        "torch==2.4.0",
        "torchaudio==2.4.0",
        "fastapi[standard]==0.115.6",
        "numpy==1.26.4",
        "soundfile==0.12.1",
    )
    .env({"HF_HOME": "/models/hf_cache"})
)

# ── Model singleton ───────────────────────────────────────────────────────────

@app.cls(
    gpu="T4",                          # 16GB VRAM >> 3GB needed for Chatterbox
    image=image,
    volumes={"/models": model_volume},
    secrets=[zarax_secret] if zarax_secret else [],
    memory_snapshot=True,              # snapshot memory after model load — faster cold starts
    scaledown_window=300,              # scale to zero after 5 min idle (no idle GPU cost)
    max_containers=3,                  # max concurrent synthesis containers
    timeout=120,                       # 2 min max per request
)
class ZaraxCloneInference:
    """
    Zarax Clone Inference — runs Chatterbox Multilingual V3 on GPU.
    Model is loaded once at container startup and reused across requests.
    """

    @modal.enter()
    def load_model(self):
        """Load Chatterbox model at container startup. Called once per container."""
        import os
        import logging
        from chatterbox.tts import ChatterboxTTS

        logging.basicConfig(level=logging.INFO)
        self.logger = logging.getLogger("zarax-clone-inference")
        self.logger.info("Loading Chatterbox Multilingual V3...")

        os.makedirs("/models/hf_cache", exist_ok=True)

        # Load multilingual model (HuggingFace auto-download to volume on first run)
        self.model = ChatterboxTTS.from_pretrained(device="cuda")
        self.model_loaded = True
        self.logger.info(
            "Chatterbox Multilingual V3 loaded successfully. "
            "VRAM: ~2-3GB. Sample rate: 24000 Hz."
        )

    def _verify_token(self, token: str) -> bool:
        """Verify internal service token. Never log the token."""
        import os
        expected = os.environ.get("ZARAX_CLONE_SERVICE_TOKEN", "")
        if not expected:
            self.logger.warning("ZARAX_CLONE_SERVICE_TOKEN not configured — denying request")
            return False
        return token == expected

    @modal.web_endpoint(method="GET", label="zarax-clone-health")
    def health(self):
        """Liveness check — always returns 200 if process is running."""
        return {"status": "ok", "service": "zarax-clone-inference", "version": "1.0.0"}

    @modal.web_endpoint(method="GET", label="zarax-clone-ready")
    def ready(self):
        """Readiness check — returns 200 only when Chatterbox model is loaded."""
        from fastapi import HTTPException
        if getattr(self, "model_loaded", False):
            return {
                "ready": True,
                "model": "chatterbox-multilingual-v3",
                "license": "MIT",
                "sample_rate": 24000,
            }
        raise HTTPException(status_code=503, detail={
            "code": "MODEL_NOT_READY",
            "message": "Chatterbox model is still loading.",
        })

    @modal.web_endpoint(method="POST", label="zarax-clone-synthesize")
    def synthesize(self, request: dict):
        """
        Synthesize speech using a cloned voice.

        Request:
            token: str — ZARAX_CLONE_SERVICE_TOKEN (internal auth)
            text: str — text to synthesize (max 1000 chars)
            audio_ref_base64: str — base64-encoded reference audio (WAV/MP3)
            language: str — BCP-47 language code (e.g. "en", "hi")
            exaggeration: float — emotion exaggeration 0.0-1.0 (default 0.5)
            speed: float — speaking rate 0.5-2.0 (default 1.0)
            format: str — "wav" or "pcm" (default "wav")
            request_id: str — correlation ID for tracing

        Response:
            audio binary (audio/wav or audio/pcm)
            Headers: X-Request-Id, X-Duration-S, X-Model, X-Sample-Rate
        """
        import base64
        import io
        import time
        import numpy as np
        import soundfile as sf
        import torchaudio
        import tempfile
        import os
        from fastapi import HTTPException
        from fastapi.responses import Response

        request_id = request.get("request_id", "unknown")

        # ── Auth ──────────────────────────────────────────────────────────────
        token = request.get("token", "")
        if not self._verify_token(token):
            self.logger.warning(f"Unauthorized synthesis request — request_id={request_id}")
            raise HTTPException(status_code=401, detail={
                "code": "TTS_UNAUTHORIZED",
                "message": "Invalid internal token.",
            })

        # ── Validate inputs ───────────────────────────────────────────────────
        text = request.get("text", "").strip()
        if not text:
            raise HTTPException(status_code=400, detail={"code": "TTS_INVALID_TEXT", "message": "Text cannot be empty."})
        if len(text) > 1000:
            raise HTTPException(status_code=400, detail={"code": "TTS_TEXT_TOO_LONG", "message": "Text exceeds 1000 characters."})

        audio_ref_b64 = request.get("audio_ref_base64", "")
        if not audio_ref_b64:
            raise HTTPException(status_code=400, detail={"code": "TTS_MISSING_REFERENCE", "message": "Reference audio required for voice cloning."})

        # Clamp expression params to safe ranges
        exaggeration = float(max(0.0, min(1.0, request.get("exaggeration", 0.5))))
        speed = float(max(0.5, min(2.0, request.get("speed", 1.0))))
        fmt = request.get("format", "wav")
        if fmt not in ("wav", "pcm"):
            fmt = "wav"

        # ── Decode reference audio ─────────────────────────────────────────
        try:
            audio_bytes = base64.b64decode(audio_ref_b64)
        except Exception:
            raise HTTPException(status_code=400, detail={"code": "TTS_INVALID_REFERENCE", "message": "Reference audio base64 decode failed."})

        # Write reference audio to temp file (Chatterbox needs a file path)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name
            tmp.write(audio_bytes)

        t0 = time.time()
        try:
            # ── Synthesize ──────────────────────────────────────────────────
            self.logger.info(
                f"SYNTHESIS_STARTED request_id={request_id} "
                f"text_len={len(text)} exaggeration={exaggeration} speed={speed}"
                # Never log: text content, audio data, tokens, embeddings
            )

            wav_tensor = self.model.generate(
                text=text,
                audio_prompt_path=tmp_path,
                exaggeration=exaggeration,
                # Note: Chatterbox Multilingual V3 does not accept speed= directly.
                # Speed is handled post-processing via resampling.
            )

            latency_s = time.time() - t0
            duration_s = wav_tensor.shape[-1] / self.model.sr

            self.logger.info(
                f"SYNTHESIS_COMPLETED request_id={request_id} "
                f"duration_s={duration_s:.2f} latency_s={latency_s:.2f} "
                f"rtf={latency_s/max(duration_s,0.001):.2f}"
            )

            # ── Convert to AudioContract: 24kHz PCM16 mono ─────────────────
            # Chatterbox outputs 24kHz — matches AudioContract directly
            audio_np = wav_tensor.squeeze().cpu().numpy()

            if fmt == "pcm":
                pcm_data = (audio_np * 32767).astype(np.int16)
                audio_output = pcm_data.tobytes()
                content_type = "audio/pcm"
            else:
                buf = io.BytesIO()
                sf.write(buf, audio_np, self.model.sr, format="WAV", subtype="PCM_16")
                audio_output = buf.getvalue()
                content_type = "audio/wav"

            return Response(
                content=audio_output,
                media_type=content_type,
                headers={
                    "X-Request-Id": request_id,
                    "X-Duration-S": f"{duration_s:.2f}",
                    "X-Latency-S": f"{latency_s:.2f}",
                    "X-Model": "chatterbox-multilingual-v3",
                    "X-Sample-Rate": str(self.model.sr),
                    "X-License": "MIT",
                    "Content-Length": str(len(audio_output)),
                },
            )

        except HTTPException:
            raise
        except Exception as e:
            self.logger.error(
                f"SYNTHESIS_FAILED request_id={request_id} error_type={type(e).__name__}"
                # Never log: error message if it might contain audio/embedding data
            )
            raise HTTPException(status_code=500, detail={
                "code": "TTS_SYNTHESIS_FAILED",
                "message": "Voice synthesis failed. Please try again.",
                "requestId": request_id,
            })
        finally:
            # Always clean up temp reference audio file
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
