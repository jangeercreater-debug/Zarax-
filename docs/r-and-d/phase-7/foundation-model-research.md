# Zarax Phase 7.3 — Foundation Model Research
## Generated: September 2026 | R&D Only — No Production Changes

## Executive Summary

Phase 7.2 (svara-TTS LoRA fine-tuning) demonstrated that WER improvement
does not guarantee human-perceived Hindi naturalness improvement.
Phase 7.3 searches for a stronger foundation model.

Critical requirement hierarchy:
1. Commercial-safe license
2. Human-perceived Hindi naturalness
3. English preservation
4. Voice cloning / speaker identity
5. Fine-tuning feasibility
6. Engineering practicality

---

## LICENSE AUDIT (Primary Source Verified)

| Model | License | Commercial | Status |
|---|---|---|---|
| VoxCPM2 (openbmb/VoxCPM2) | Apache 2.0 | ✅ YES | COMMERCIAL-SAFE |
| Qwen3-TTS (Qwen) | Apache 2.0 | ✅ YES | COMMERCIAL-SAFE |
| Kokoro 82M (hexgrad) | Apache 2.0 | ✅ YES | PRODUCTION (keep) |
| Chatterbox (Resemble) | MIT | ✅ YES | PRODUCTION (keep) |
| Step Audio EditX (StepFun) | Apache 2.0 | ✅ YES | INVESTIGATE |
| Maya1 (Maya Research) | Apache 2.0 | ✅ YES | INVESTIGATE |
| Dia (Nari Labs) | Apache 2.0 | ✅ YES | LIMITED Hindi |
| Fish Speech/S2 Pro | Fish Audio Research License | ❌ NO | REJECTED — commercial requires separate paid agreement |
| Fish Audio S2 Pro | Fish Audio Research License | ❌ NO | REJECTED |
| F5-TTS (SWivid) | CC-BY-NC 4.0 | ❌ NO | REJECTED |
| Breeze TTS 2 | Research (non-commercial) | ❌ NO | REJECTED |
| Voxtral TTS (Mistral) | CC-BY-NC 4.0 | ❌ NO | REJECTED |
| Higgs Audio V3 | Research (non-commercial) | ❌ NO | REJECTED |
| XTTS v2 (Coqui) | CPML | ❌ NO | REJECTED |
| IndicF5 (AI4Bharat) | CC-BY-NC-4.0 | ❌ NO | REJECTED |

**Evidence sources:** GitHub LICENSE files, HuggingFace model cards,
primary documentation. Not relying on marketing claims.

---

## SURVIVING CANDIDATES (commercial-safe)

### 1. VoxCPM2 — openbmb/VoxCPM2
**License:** Apache 2.0 ✅
**Size:** 2B params
**Languages:** 30 (Hindi included)
**Hindi WER (MiniMax-MLS cloning benchmark):** 19.70 — HIGH (poor)
**English WER (MiniMax-MLS):** 2.29 — GOOD
**Note:** Hindi WER is for CLONING benchmark. Standard TTS quality unknown.
Hindi described as "limited data volume" — quality improvement possible via fine-tuning.
**Voice cloning:** YES (reference audio)
**Voice design:** YES (text description → novel voice)
**Streaming:** YES (RTF ~0.3 on RTX 4090)
**Output:** 48kHz
**Fine-tuning:** YES (SFT + LoRA documented)
**Zarax assessment:** STRONG CANDIDATE for benchmark

### 2. Qwen3-TTS-VoiceDesign — Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign
**License:** Apache 2.0 ✅
**Size:** 1.7B
**Languages:** 10 (English, Chinese, Japanese, Korean, German, French,
               Russian, Portuguese, Spanish, Italian)
**Hindi:** NOT OFFICIALLY SUPPORTED
**Phase 7.1 result:** English 10/10 success, Hindi 0/10 fail
**Zarax assessment:** EXPERIMENTAL ONLY — Hindi not supported

### 3. Kokoro 82M — hexgrad/Kokoro-82M
**License:** Apache 2.0 ✅
**MOS:** 4.2 (highest naturalness per parameter)
**Status:** PRODUCTION — keep protected
**Hindi:** Working (hf_alpha voice)
**Zarax assessment:** KEEP IN PRODUCTION — baseline comparison only

### 4. Chatterbox — Resemble AI
**License:** MIT ✅
**Status:** PRODUCTION (voice cloning) — keep protected
**Zarax assessment:** KEEP IN PRODUCTION — baseline comparison only

### 5. Step Audio EditX — StepFun
**License:** Apache 2.0 ✅
**Elo:** 1,102 (highest commercial-safe on leaderboard)
**Hindi support:** UNKNOWN — requires investigation
**Zarax assessment:** INVESTIGATE — benchmark if Hindi supported

### 6. Maya1 — Maya Research
**License:** Apache 2.0 ✅
**Elo:** 1,045
**Hindi support:** UNKNOWN — requires investigation
**Zarax assessment:** INVESTIGATE

---

## TECHNICAL CAPABILITY MATRIX

| Capability | VoxCPM2 | Qwen3-VD | Kokoro | Step EditX | Maya1 |
|---|---|---|---|---|---|
| Hindi | PARTIAL | NO | YES | UNKNOWN | UNKNOWN |
| English | YES | YES | YES | YES | UNKNOWN |
| Hinglish | UNKNOWN | NO | UNKNOWN | UNKNOWN | UNKNOWN |
| Voice cloning | YES | NO | NO | YES | UNKNOWN |
| Cross-lang clone | PARTIAL | NO | NO | UNKNOWN | UNKNOWN |
| Voice design | YES | YES | NO | YES | UNKNOWN |
| Emotion | YES | LIMITED | NO | YES | UNKNOWN |
| Style | YES | YES | NO | YES | UNKNOWN |
| Streaming | YES | YES | YES | UNKNOWN | UNKNOWN |
| Fine-tuning | YES (LoRA) | LIMITED | YES | UNKNOWN | UNKNOWN |
| VRAM | ~8GB (2B) | ~4GB | <1GB | UNKNOWN | UNKNOWN |
| Commercial | YES | YES | YES | YES | YES |

---

## HINDI-SPECIFIC ASSESSMENT

**Critical lesson from Phase 7.2:** WER improvement ≠ human naturalness.

VoxCPM2 Hindi weaknesses (documented):
- High WER (19.70) in cloning benchmark
- "Limited data volume" for Hindi in training
- BUT: standard TTS (non-cloning) quality untested

HOWEVER: VoxCPM2 is the ONLY commercial-safe model with:
- Native Hindi in training set
- Voice cloning + cross-language potential
- LoRA fine-tuning support
- Apache 2.0 license
- Active development (2B params released April 2026)

Hypothesis: VoxCPM2 standard TTS quality for Hindi may be better than
cloning benchmark suggests. Must verify via actual inference testing.

---

## SELECTED CANDIDATES FOR BENCHMARK

Priority order:
1. **VoxCPM2** — strongest multilingual candidate, Apache 2.0
2. **Kokoro** — current production baseline
3. **Chatterbox** — current voice cloning baseline
4. **Step Audio EditX** — highest-ranked commercial-safe (Hindi TBD)

Rejected from benchmark (license):
- Fish Speech, F5-TTS, Higgs Audio, XTTS v2, Voxtral, IndicF5

---

## LONG-TERM ZARAX ROADMAP COMPATIBILITY

**VoxCPM2 path to Zarax Voice Engine V2:**
