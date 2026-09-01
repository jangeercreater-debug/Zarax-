"""
Zarax Clone Inference Service — Modal GPU
==========================================
Phase 6: Consent-based voice cloning synthesis on serverless GPU.

Model: Chatterbox Multilingual V3 (ResembleAI/chatterbox, MIT license)
GPU: T4 (dev) / A10 (production)
Architecture: scale-to-zero serverless, model cached in Modal Volume

IMPORTANT:
- Modal provides GPU infrastructure ONLY — no third-party TTS API is used.
- Speech generation happens entirely inside this container.
- Authentication: ZARAX_CLONE_SERVICE_TOKEN required on every request.
- Never log: raw audio, speaker embeddings, auth tokens.
"""

import modal

app = modal.App("zarax-clone-inference")

model_volume = modal.Volume.from_name("zarax-chatterbox-models", create_if_missing=True)

zarax_secret = modal.Secret.from_name("zarax-clone-secret")

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


@app.cls(
    gpu="T4",
    image=image,
    volumes={"/models": model_volume},
    secrets=[zarax_secret],
    scaledown_window=300,
    max_containers=3,
    timeout=120,
)
class ZaraxCloneInference:

    @modal.enter()
    def load_model(self):
        import os
        import logging
        from chatterbox.tts import ChatterboxTTS

        logging.basicConfig(level=logging.INFO)
        self.logger = logging.getLogger("zarax-clone-inference")
        self.logger.info("Loading Chatterbox Multilingual V3...")

        os.makedirs("/models/hf_cache", exist_ok=True)

        self.model = ChatterboxTTS.from_pretrained(device="cuda")
        self.model_loaded = True
        self.logger.info("Chatterbox Multilingual V3 loaded. Sample rate: 24000 Hz.")

    def _verify_token(self, token: str) -> bool:
        import os
        expected = os.environ.get("ZARAX_CLONE_SERVICE_TOKEN", "")
        if not expected:
            self.logger.warning("ZARAX_CLONE_SERVICE_TOKEN not configured")
            return False
        return token == expected

    @modal.fastapi_endpoint(method="GET")
    def health(self):
        return {"status": "ok", "service": "zarax-clone-inference", "version": "1.0.0"}

    @modal.fastapi_endpoint(method="GET")
    def ready(self):
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

    @modal.fastapi_endpoint(method="POST")
    def synthesize(self, request: dict):
        import base64
        import io
        import time
        import numpy as np
        import soundfile as sf
        import tempfile
        import os
        from fastapi import HTTPException
        from fastapi.responses import Response

        request_id = request.get("request_id", "unknown")

        token = request.get("token", "")
        if not self._verify_token(token):
            self.logger.warning(f"Unauthorized request_id={request_id}")
            raise HTTPException(status_code=401, detail={
                "code": "TTS_UNAUTHORIZED",
                "message": "Invalid internal token.",
            })

        text = request.get("text", "").strip()
        if not text:
            raise HTTPException(status_code=400, detail={"code": "TTS_INVALID_TEXT", "message": "Text cannot be empty."})
        if len(text) > 1000:
            raise HTTPException(status_code=400, detail={"code": "TTS_TEXT_TOO_LONG", "message": "Text exceeds 1000 characters."})

        audio_ref_b64 = request.get("audio_ref_base64", "")
        if not audio_ref_b64:
            raise HTTPException(status_code=400, detail={"code": "TTS_MISSING_REFERENCE", "message": "Reference audio required."})

        exaggeration = float(max(0.0, min(1.0, request.get("exaggeration", 0.5))))
        fmt = request.get("format", "wav")
        if fmt not in ("wav", "pcm"):
            fmt = "wav"

        try:
            audio_bytes = base64.b64decode(audio_ref_b64)
        except Exception:
            raise HTTPException(status_code=400, detail={"code": "TTS_INVALID_REFERENCE", "message": "Reference audio base64 decode failed."})

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name
            tmp.write(audio_bytes)

        t0 = time.time()
        try:
            self.logger.info(
                f"SYNTHESIS_STARTED request_id={request_id} "
                f"text_len={len(text)} exaggeration={exaggeration}"
            )

            wav_tensor = self.model.generate(
                text=text,
                audio_prompt_path=tmp_path,
                exaggeration=exaggeration,
            )

            latency_s = time.time() - t0
            duration_s = wav_tensor.shape[-1] / self.model.sr

            self.logger.info(
                f"SYNTHESIS_COMPLETED request_id={request_id} "
                f"duration_s={duration_s:.2f} latency_s={latency_s:.2f} "
                f"rtf={latency_s/max(duration_s,0.001):.2f}"
            )

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
                    "Content-Length": str(len(audio_output)),
                },
            )

        except HTTPException:
            raise
        except Exception as e:
            self.logger.error(f"SYNTHESIS_FAILED request_id={request_id} error_type={type(e).__name__}")
            raise HTTPException(status_code=500, detail={
                "code": "TTS_SYNTHESIS_FAILED",
                "message": "Voice synthesis failed. Please try again.",
                "requestId": request_id,
            })
        finally:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
              
