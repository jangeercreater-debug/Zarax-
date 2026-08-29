# ============================================================
# Zarax TTS Inference Service
# Model: Kokoro-82M (Apache 2.0)
# Phase 2: Open-Source TTS Base
#
# Build: docker build -t zarax-tts-inference .
# Run:   docker run -p 8000:8000 \
#          -e ZARAX_TTS_INTERNAL_TOKEN=<token> \
#          -v kokoro_cache:/tmp/zarax_tts_models \
#          zarax-tts-inference
#
# Model weights (~327MB) are downloaded from HuggingFace on first
# startup and cached in the volume — not committed to Git.
# ============================================================

FROM python:3.11-slim AS base

# System dependencies required by Kokoro + soundfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    espeak-ng \
    libsndfile1 \
    libgomp1 \
    wget \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Install Python dependencies ──────────────────────────────
FROM base AS deps

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Final image ───────────────────────────────────────────────
FROM deps AS runner

# Non-root user for security
RUN groupadd -r zarax && useradd -r -g zarax zarax

# Copy application
COPY --chown=zarax:zarax main.py .
COPY --chown=zarax:zarax voices.json .

# Model cache directory — mount as volume in production
RUN mkdir -p /tmp/zarax_tts_models && chown zarax:zarax /tmp/zarax_tts_models

# HuggingFace cache points to our volume
ENV HF_HOME=/tmp/zarax_tts_models
ENV MODEL_CACHE_DIR=/tmp/zarax_tts_models
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

USER zarax

EXPOSE 8000

# Health check — /ready returns 503 until model loads, 200 when ready
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--log-level", "info"]
