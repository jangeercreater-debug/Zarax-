"""
Zarax TTS Inference Service
===========================
Phase 2: Open-Source TTS Base + Zarax Inference Service

Model: Kokoro-82M (hexgrad/Kokoro-82M)
License: Apache 2.0 — commercial use permitted
Architecture: StyleTTS 2 + ISTFTNet decoder-only
Output: 24kHz PCM/WAV — matches Phase 1 AudioContract

Security: X-Internal-Token auth (same pattern as existing Zarax services)
Multi-tenancy: Zarax API enforces tenant/RBAC before calling this service
"""

import io
import json
import logging
import os
import time
import uuid
from pathlib import Path
from typing import Optional

import numpy as np
import soundfile as sf
import uvicorn
from fastapi import FastAPI, Header, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

# ── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("zarax-tts")

# ── Configuration ─────────────────────────────────────────────────────────────

INTERNAL_TOKEN = os.getenv("ZARAX_TTS_INTERNAL_TOKEN", "")
MODEL_CACHE_DIR = os.getenv("MODEL_CACHE_DIR", "/tmp/zarax_tts_models")
SERVICE_VERSION = "1.0.0"
MODEL_NAME = "hexgrad/Kokoro-82M"
MAX_TEXT_LENGTH = 5000
DEFAULT_SAMPLE_RATE = 24000

# ── Voice registry ─────────────────────────────────────────────────────────────

VOICES_PATH = Path(__file__).parent / "voices.json"
try:
    with open(VOICES_PATH) as f:
        VOICES_CONFIG = json.load(f)
    VOICE_MAP = {v["voice_id"]: v for v in VOICES_CONFIG["voices"]}
except Exception as e:
    logger.error(f"Failed to load voices.json: {e}")
    VOICE_MAP = {}

# ── Model singleton ────────────────────────────────────────────────────────────

_pipeline = None
_model_loaded = False
_model_load_error: Optional[str] = None
_model_load_time: Optional[float] = None


def load_model() -> bool:
    """Load Kokoro model once at startup. Returns True on success."""
    global _pipeline, _model_loaded, _model_load_error, _model_load_time

    if _model_loaded:
        return True

    t0 = time.time()
    try:
        logger.info(f"Loading Kokoro TTS model ({MODEL_NAME})...")
        from kokoro import KPipeline

        # KPipeline downloads model from HuggingFace on first run,
        # then caches it. lang_code='a' = American English (default).
        # We create separate pipelines per language as needed.
        _pipeline = {
            "a": KPipeline(lang_code="a"),  # American English
        }

        # Try Hindi pipeline — may not be available in all Kokoro versions
        try:
            _pipeline["h"] = KPipeline(lang_code="h")
            logger.info("Hindi pipeline loaded.")
        except Exception as e:
            logger.warning(f"Hindi pipeline unavailable: {e} — Hindi voices will use English pipeline")

        _model_loaded = True
        _model_load_time = time.time() - t0
        logger.info(f"Kokoro model loaded in {_model_load_time:.2f}s")
        return True

    except Exception as e:
        _model_load_error = str(e)
        logger.error(f"Model load failed: {e}")
        return False


# ── FastAPI app ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Zarax TTS Inference Service",
    description="Internal TTS inference for Zarax Voice Engine (Phase 2). Model: Kokoro-82M Apache 2.0.",
    version=SERVICE_VERSION,
    docs_url="/docs",
    redoc_url=None,
)


def verify_token(x_internal_token: Optional[str] = Header(None)):
    """Verify internal service token. Same pattern as existing Zarax services."""
    if not INTERNAL_TOKEN:
        # Dev mode: no token configured — allow
        return
    if x_internal_token != INTERNAL_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "TTS_UNAUTHORIZED", "message": "Invalid internal token."},
        )


# ── Health / Readiness ─────────────────────────────────────────────────────────


@app.get("/health")
def health():
    """Basic liveness — always returns 200 if the process is running."""
    return {
        "status": "ok",
        "service": "zarax-tts-inference",
        "version": SERVICE_VERSION,
    }


@app.get("/ready")
def ready():
    """Readiness — returns 200 only when the model is loaded."""
    if _model_loaded:
        return {
            "ready": True,
            "model": MODEL_NAME,
            "model_load_time_s": round(_model_load_time or 0, 2),
            "voices": len(VOICE_MAP),
        }
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail={
            "code": "TTS_MODEL_NOT_READY",
            "message": _model_load_error or "Model not yet loaded.",
        },
    )


@app.get("/model")
def model_info():
    """Returns model metadata — voice ID, version, capabilities."""
    return {
        "model": MODEL_NAME,
        "version": SERVICE_VERSION,
        "license": "Apache-2.0",
        "voices": list(VOICE_MAP.keys()),
        "sample_rate": DEFAULT_SAMPLE_RATE,
        "channels": 1,
        "encoding": "pcm_s16le",
        "max_text_length": MAX_TEXT_LENGTH,
        "loaded": _model_loaded,
    }


@app.get("/voices")
def list_voices():
    """List all available Zarax voices."""
    return {"voices": list(VOICE_MAP.values()), "total": len(VOICE_MAP)}


# ── Synthesis ──────────────────────────────────────────────────────────────────


class SynthesizeRequest(BaseModel):
    text: str = Field(..., max_length=MAX_TEXT_LENGTH, description="Text to synthesize.")
    voice_id: str = Field(..., description="Zarax voice ID from voices.json.")
    language: Optional[str] = Field(None, description="BCP-47 language override.")
    speed: float = Field(1.0, ge=0.5, le=2.0, description="Speed multiplier.")
    format: str = Field("wav", description="Output format: wav or pcm.")
    request_id: Optional[str] = Field(None, description="Correlation ID for tracing.")


@app.post("/synthesize")
def synthesize(req: SynthesizeRequest, x_internal_token: Optional[str] = Header(None)):
    """
    Synthesize text to audio using Kokoro TTS.

    Returns binary WAV (Content-Type: audio/wav) or raw PCM (audio/pcm).
    Errors return JSON with a structured TTS_* error code.

    Security: requires X-Internal-Token matching ZARAX_TTS_INTERNAL_TOKEN.
    Multi-tenancy: Zarax API has already validated tenant/RBAC before calling here.
    """
    verify_token(x_internal_token)

    request_id = req.request_id or str(uuid.uuid4())
    t0 = time.time()

    # ── Validate model ready ────────────────────────────────────────────────
    if not _model_loaded:
        raise HTTPException(
            status_code=503,
            detail={"code": "TTS_MODEL_NOT_READY", "requestId": request_id,
                    "message": _model_load_error or "Model not loaded."},
        )

    # ── Validate voice ──────────────────────────────────────────────────────
    voice_config = VOICE_MAP.get(req.voice_id)
    if not voice_config:
        raise HTTPException(
            status_code=400,
            detail={"code": "TTS_INVALID_VOICE", "requestId": request_id,
                    "message": f"Voice '{req.voice_id}' not found."},
        )

    # ── Validate text ───────────────────────────────────────────────────────
    text = req.text.strip()
    if not text:
        raise HTTPException(
            status_code=400,
            detail={"code": "TTS_INVALID_TEXT", "requestId": request_id,
                    "message": "Text cannot be empty."},
        )

    # ── Select Kokoro pipeline + voice ──────────────────────────────────────
    lang_code = voice_config.get("kokoro_lang_code", "a")
    kokoro_voice = voice_config.get("kokoro_voice", "af_heart")

    # Fallback to English pipeline if requested language pipeline unavailable
    pipeline = _pipeline.get(lang_code) or _pipeline.get("a")
    if pipeline is None:
        raise HTTPException(
            status_code=503,
            detail={"code": "TTS_INFERENCE_UNAVAILABLE", "requestId": request_id,
                    "message": "TTS pipeline not available."},
        )

    # ── Synthesize ──────────────────────────────────────────────────────────
    try:
        audio_chunks = []
        for _, _, audio in pipeline(text, voice=kokoro_voice, speed=req.speed):
            if audio is not None:
                audio_chunks.append(audio)

        if not audio_chunks:
            raise HTTPException(
                status_code=500,
                detail={"code": "TTS_SYNTHESIS_FAILED", "requestId": request_id,
                        "message": "Synthesis produced no audio output."},
            )

        # Concatenate all chunks
        audio_data = np.concatenate(audio_chunks, axis=0)

        latency_ms = round((time.time() - t0) * 1000)
        audio_duration_s = len(audio_data) / DEFAULT_SAMPLE_RATE

        logger.info(
            f"synthesize voice={req.voice_id} chars={len(text)} "
            f"duration={audio_duration_s:.2f}s latency={latency_ms}ms "
            f"rtf={((time.time()-t0)/max(audio_duration_s,0.001)):.2f} "
            f"request_id={request_id}"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Synthesis error request_id={request_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail={"code": "TTS_SYNTHESIS_FAILED", "requestId": request_id,
                    "message": "Synthesis failed."},
        )

    # ── Encode audio ────────────────────────────────────────────────────────
    if req.format == "pcm":
        # Raw PCM s16le — for direct LiveKit/voice-runtime consumption
        pcm_data = (audio_data * 32767).astype(np.int16)
        audio_bytes = pcm_data.tobytes()
        content_type = "audio/pcm"
    else:
        # WAV — default for preview and API responses
        buf = io.BytesIO()
        sf.write(buf, audio_data, DEFAULT_SAMPLE_RATE, format="WAV", subtype="PCM_16")
        audio_bytes = buf.getvalue()
        content_type = "audio/wav"

    return Response(
        content=audio_bytes,
        media_type=content_type,
        headers={
            "X-Request-Id": request_id,
            "X-Voice-Id": req.voice_id,
            "X-Audio-Duration-S": f"{audio_duration_s:.2f}",
            "X-Latency-Ms": str(latency_ms),
            "X-Model": MODEL_NAME,
            "Content-Length": str(len(audio_bytes)),
        },
    )


# ── Startup: load model ────────────────────────────────────────────────────────


@app.on_event("startup")
async def startup_event():
    """Load model at startup. Service returns 503 from /ready until loaded."""
    logger.info("Zarax TTS Inference Service starting...")
    success = load_model()
    if not success:
        logger.error(
            "Model failed to load at startup. Service will return 503 until model loads. "
            "Check that kokoro is installed and HuggingFace is accessible."
        )


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
