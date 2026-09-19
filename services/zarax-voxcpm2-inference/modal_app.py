"""
Zarax VoxCPM2 Inference Service — Modal GPU
=============================================
Phase 7.4: Experimental Hindi/Hinglish TTS via VoxCPM2.

Model:   openbmb/VoxCPM2 (Apache 2.0 — commercial-safe)
GPU:     L4 (VRAM: ~6GB)
Output:  pcm_s16le / 24kHz / mono (AudioContract compliant)

IMPORTANT:
- Standard TTS only — user voice cloning NOT proven across languages.
- Do NOT claim VoxCPM2 preserves the cloned user's voice.
- Feature flag VOXCPM2_TTS_ENABLED=false disables routing entirely.
- Production Chatterbox path is UNCHANGED and PROTECTED.
- Apache 2.0 license verified: openbmb/VoxCPM2 GitHub + HuggingFace.
"""

import modal

app = modal.App("zarax-voxcpm2-inference")

model_volume = modal.Volume.from_name("zarax-voxcpm2-models", create_if_missing=True)
zarax_secret = modal.Secret.from_name("zarax-voxcpm2-secret")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "libsndfile1")
    .pip_install(
        "voxcpm>=0.1.0",
        "torch>=2.5.0",
        "torchaudio>=2.5.0",
        "numpy>=1.24.0",
        "soundfile>=0.12.1",
        "librosa>=0.10.0",
        "fastapi[standard]>=0.111.0",
    )
    .env({"HF_HOME": "/models/hf_cache"})
)

# AudioContract constants
AUDIO_CONTRACT_SR = 24000   # 24kHz
AUDIO_CONTRACT_CHANNELS = 1  # mono
AUDIO_CONTRACT_DTYPE = "int16"  # pcm_s16le


@app.cls(
    gpu="L4",
    image=image,
    volumes={"/models": model_volume},
    secrets=[zarax_secret],
    scaledown_window=1800,  # 30 min warm — reduces cold starts
    max_containers=2,
    timeout=180,
)
class ZaraxVoxCPM2Inference:

    @modal.enter()
    def load_model(self):
        import os
        import logging
        from voxcpm import VoxCPM

        logging.basicConfig(level=logging.INFO)
        self.logger = logging.getLogger("zarax-voxcpm2-inference")
        self.logger.info("Loading VoxCPM2 (openbmb/VoxCPM2, Apache 2.0)...")

        os.makedirs("/models/hf_cache", exist_ok=True)
        self.model = VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False)
        self.sample_rate = self.model.tts_model.sample_rate  # 48kHz raw output
        self.model_loaded = True
        self.logger.info(
            f"VoxCPM2 loaded. Raw SR: {self.sample_rate}Hz → "
            f"AudioContract: {AUDIO_CONTRACT_SR}Hz mono pcm_s16le"
        )

    def _verify_token(self, token: str) -> bool:
        import os
        expected = os.environ.get("ZARAX_VOXCPM2_SERVICE_TOKEN", "")
        if not expected:
            self.logger.warning("ZARAX_VOXCPM2_SERVICE_TOKEN not configured")
            return False
        return token == expected

    def _to_audio_contract(self, wav_np) -> bytes:
        """Convert VoxCPM2 48kHz float32 → AudioContract: 24kHz mono pcm_s16le"""
        import numpy as np
        import librosa

        # Ensure mono
        if wav_np.ndim > 1:
            wav_np = wav_np.mean(axis=0)

        # Resample 48kHz → 24kHz
        if self.sample_rate != AUDIO_CONTRACT_SR:
            wav_np = librosa.resample(
                wav_np.astype("float32"),
                orig_sr=self.sample_rate,
                target_sr=AUDIO_CONTRACT_SR,
            )

        # Clamp to [-1, 1]
        wav_np = np.clip(wav_np, -1.0, 1.0)

        # Convert to pcm_s16le
        pcm = (wav_np * 32767).astype(np.int16)

        return pcm.tobytes()

    @modal.fastapi_endpoint(method="GET")
    def health(self):
        return {
            "status": "ok",
            "service": "zarax-voxcpm2-inference",
            "model": "openbmb/VoxCPM2",
            "license": "Apache-2.0",
            "audio_contract": {
                "sample_rate": AUDIO_CONTRACT_SR,
                "channels": AUDIO_CONTRACT_CHANNELS,
                "format": "pcm_s16le",
            },
        }

    @modal.fastapi_endpoint(method="POST")
    def synthesize(self, request: dict):
        import base64
        import time
        import numpy as np
        from fastapi import HTTPException

        # Auth
        token = request.get("token", "")
        if not self._verify_token(token):
            raise HTTPException(status_code=401, detail="Unauthorized")

        if not getattr(self, "model_loaded", False):
            raise HTTPException(status_code=503, detail="Model not ready")

        text = str(request.get("text", "")).strip()
        language = request.get("language", "hindi")  # hindi | hinglish | english
        request_id = request.get("request_id", "unknown")

        if not text:
            raise HTTPException(status_code=400, detail="text required")

        # Safety: max 500 chars to control latency
        text = text[:500]

        self.logger.info(f"[{request_id}] synthesize lang={language} chars={len(text)}")

        try:
            t_start = time.time()

            # Standard TTS — no user voice cloning
            # NOTE: This generates VoxCPM2's own voice, NOT the user's cloned voice.
            # Cross-language voice cloning is UNTESTED per Phase 7.4 requirements.
            wav = self.model.generate(
                text=text,
                cfg_value=2.0,
                inference_timesteps=10,
            )

            latency_ms = round((time.time() - t_start) * 1000)

            # Validate output
            if wav is None or len(wav) == 0:
                raise ValueError("VoxCPM2 returned empty audio")

            if np.isnan(wav).any() or np.isinf(wav).any():
                raise ValueError("VoxCPM2 returned NaN/Inf in audio")

            # Convert to AudioContract
            pcm_bytes = self._to_audio_contract(wav)

            # Validate
            n_samples = len(pcm_bytes) // 2  # int16 = 2 bytes
            duration_s = n_samples / AUDIO_CONTRACT_SR

            if duration_s < 0.1:
                raise ValueError(f"Audio too short: {duration_s:.2f}s")

            peak = np.max(np.abs(np.frombuffer(pcm_bytes, dtype=np.int16)))
            is_clipping = peak > 32000
            is_silent = peak < 100

            self.logger.info(
                f"[{request_id}] done: {duration_s:.2f}s, {latency_ms}ms, "
                f"peak={peak}, clipping={is_clipping}, silent={is_silent}"
            )

            return {
                "audio_base64": base64.b64encode(pcm_bytes).decode(),
                "sample_rate": AUDIO_CONTRACT_SR,
                "channels": AUDIO_CONTRACT_CHANNELS,
                "format": "pcm_s16le",
                "duration_s": round(duration_s, 2),
                "latency_ms": latency_ms,
                "language": language,
                "model": "openbmb/VoxCPM2",
                "license": "Apache-2.0",
                "voice_cloning": False,  # Explicit: NOT cloned user voice
                "warnings": (
                    ["peak_clipping"] if is_clipping else []
                ) + (
                    ["silent_output"] if is_silent else []
                ),
            }

        except Exception as e:
            self.logger.error(f"[{request_id}] synthesis failed: {e}")
            raise HTTPException(status_code=500, detail=str(e))


@app.local_entrypoint()
def main():
    """Deploy and test."""
    result = ZaraxVoxCPM2Inference().health.remote()
    print(result)
