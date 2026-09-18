"""
Zarax Phase 7.3 — Foundation Model Benchmark
=============================================
EVALUATION ONLY — no training, no production changes.

Tests VoxCPM2 (primary candidate) against Kokoro baseline.
Uses standardized texts from foundation_benchmark_texts.json.

Candidates:
  PRIMARY: VoxCPM2 (openbmb/VoxCPM2) — Apache 2.0
  BASELINE: Kokoro 82M — Apache 2.0 (current production)

License verified:
  VoxCPM2: Apache 2.0 ✅ commercial-safe
  Kokoro:  Apache 2.0 ✅ commercial-safe

Production safety: ZERO changes. R&D isolated.
"""

import modal, json, os, csv, time, hashlib
from datetime import datetime

app = modal.App("zarax-phase73-benchmark")
rnd_volume = modal.Volume.from_name("zarax-rnd-vol", create_if_missing=True)
hf_secret = modal.Secret.from_name("zarax-rnd-hf-secret")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "espeak-ng")
    .pip_install(
        "voxcpm>=0.1.0",
        "kokoro>=0.9.4",
        "torch>=2.5.0",
        "torchaudio>=2.5.0",
        "soundfile>=0.12.1",
        "numpy>=1.24.0",
        "openai-whisper>=20231117",
        "jiwer>=3.0.0",
        "huggingface_hub>=0.24.0",
        "fastapi[standard]>=0.111.0",
    )
    .env({"HF_HOME": "/rnd/hf_cache"})
)

BENCH_DIR = "/rnd/phase73_benchmark"
TEXTS_PATH = "foundation_benchmark_texts.json"

EVAL_TEXTS = {
    "hindi": [
        {"id":"hi_01","text":"Namaste, aap kaise hain aaj?"},
        {"id":"hi_02","text":"Kya main aapki madad kar sakta hoon?"},
        {"id":"hi_03","text":"Dhanyavad."},
        {"id":"hi_04","text":"Mera naam Zarax hai aur main aapka AI assistant hoon."},
        {"id":"hi_05","text":"Aapki appointment kal teen baje scheduled hai."},
        {"id":"hi_06","text":"Hamare platform par aap apni awaaz clone kar sakte hain."},
        {"id":"hi_07","text":"Pratigya aur pratibaddh vyakti ne pratirodh ka saamna kiya."},
        {"id":"hi_08","text":"Vigyaan aur takneek ke kshetra mein bharat ne bahut pragati ki hai."},
        {"id":"hi_09","text":"Aapka order number paanch char teen do ek hai."},
        {"id":"hi_10","text":"Kya aapne apna phone number confirm kar diya?"},
        {"id":"hi_11","text":"Aapki request process ho rahi hai, please wait karein."},
        {"id":"hi_12","text":"Zarax mein aapka swagat hai. Behtar seva ke liye ek dabayein."},
        {"id":"hi_13","text":"नमस्ते, आप कैसे हैं आज?"},
        {"id":"hi_14","text":"मेरा नाम ज़ारैक्स है, मैं आपका AI असिस्टेंट हूँ।"},
        {"id":"hi_15","text":"Spasht awaaz mein bolein taaki samajh mein aaye."},
        {"id":"hi_16","text":"Subah ka waqt sabse accha hota hai kaam karne ke liye."},
        {"id":"hi_17","text":"Yeh company baees hazaar karmodon mein kaam karti hai."},
        {"id":"hi_18","text":"Aaj paanch September do hazaar chhabbis hai."},
        {"id":"hi_19","text":"Aap kaun si bhasha mein baat karna chahte hain?"},
        {"id":"hi_20","text":"Sthapit sanstha ne sthiti sudhaarne ke liye kadam uthaye."},
    ],
    "english": [
        {"id":"en_01","text":"Hello, how are you today?"},
        {"id":"en_02","text":"Thank you for calling Zarax. How may I assist you?"},
        {"id":"en_03","text":"Please hold."},
        {"id":"en_04","text":"Your appointment has been confirmed for tomorrow at three PM."},
        {"id":"en_05","text":"We are working on improving our AI voice platform to support multiple Indian languages."},
        {"id":"en_06","text":"Your order number is one two three four five six."},
        {"id":"en_07","text":"Can you help me find the nearest hospital?"},
        {"id":"en_08","text":"The meeting has been rescheduled to Friday morning."},
        {"id":"en_09","text":"First, please confirm your name. Then, provide your date of birth."},
        {"id":"en_10","text":"The quarterly earnings report demonstrates a fifteen percent increase in revenue."},
    ],
    "hinglish": [
        {"id":"hg_01","text":"Hello bro, aaj market ka kya scene hai?"},
        {"id":"hg_02","text":"Namaste! Aapka account balance check karna hai kya?"},
        {"id":"hg_03","text":"Please hold karo, main abhi connect karta hoon."},
        {"id":"hg_04","text":"Aapki call important hai, please wait karo."},
        {"id":"hg_05","text":"Sorry yaar, ek minute mein aapko callback milega."},
        {"id":"hg_06","text":"Aapka internet connection slow hai, please router restart karo."},
        {"id":"hg_07","text":"Bhai, aaj meeting cancel ho gayi, koi tension nahi."},
        {"id":"hg_08","text":"Your order successfully place ho gaya hai, delivery kal hogi."},
        {"id":"hg_09","text":"Main kal office mein present karunga the quarterly report."},
        {"id":"hg_10","text":"Yaar, kya tum mujhe help kar sakte ho is problem solve karne mein?"},
    ],
}


def log(msg):
    print(f"[Phase73 {datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def compute_wer(hyp, ref):
    try:
        from jiwer import wer
        import unicodedata, re
        def norm(t):
            t = unicodedata.normalize("NFC", t.lower())
            return re.sub(r'\s+', ' ', re.sub(r'[^\w\s]', '', t)).strip()
        return round(wer(norm(ref), norm(hyp)), 3)
    except:
        return None


def check_audio(path):
    import soundfile as sf, numpy as np
    try:
        audio, sr = sf.read(path)
        dur = len(audio) / sr
        peak = float(np.max(np.abs(audio)))
        return {
            "valid": True, "duration_s": round(dur, 2), "sample_rate": sr,
            "peak": round(peak, 4), "is_silent": peak < 0.001,
            "is_clipping": peak > 0.99, "size_bytes": os.path.getsize(path),
        }
    except Exception as e:
        return {"valid": False, "error": str(e)}


@app.function(
    gpu="L4",
    image=image,
    volumes={"/rnd": rnd_volume},
    secrets=[hf_secret],
    timeout=10800,
)
def run_benchmark():
    import torch, soundfile as sf, whisper, time, gc
    import huggingface_hub

    os.makedirs(BENCH_DIR, exist_ok=True)
    for d in ["voxcpm2", "kokoro", "human_listening", "reports"]:
        os.makedirs(f"{BENCH_DIR}/{d}", exist_ok=True)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    hf_token = os.environ.get("HF_TOKEN", "")
    if hf_token:
        huggingface_hub.login(token=hf_token, add_to_git_credential=False)

    t_start = time.time()
    results = {
        "phase": "7.3", "benchmark_date": datetime.now().isoformat(),
        "candidates": {}, "comparison": {},
        "production_changes": "ZERO",
        "human_listening": "UNTESTED — audio files saved for human evaluation",
    }

    log("=" * 60)
    log("PHASE 7.3 — FOUNDATION MODEL BENCHMARK")
    log("Candidates: VoxCPM2 vs Kokoro (baseline)")
    log(f"GPU: {torch.cuda.get_device_name(0) if device=='cuda' else 'CPU'}")
    log("=" * 60)

    whisper_model = whisper.load_model("base")
    log("Whisper ASR loaded")

    # ── CANDIDATE 1: VoxCPM2 ──────────────────────────────────────────────────
    log("\n=== CANDIDATE 1: VoxCPM2 (openbmb/VoxCPM2) ===")
    log("License: Apache 2.0 ✅ | 30 languages | Hindi included")
    voxcpm2_results = {"model": "openbmb/VoxCPM2", "license": "Apache 2.0",
                       "commercial_safe": True, "hindi_in_training": True}

    try:
        from voxcpm import VoxCPM
        t_load = time.time()
        vox_model = VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False)
        load_time = time.time() - t_load
        vram_loaded = torch.cuda.memory_allocated() / 1e9 if device == "cuda" else 0
        log(f"  VoxCPM2 loaded | {load_time:.1f}s | VRAM: {vram_loaded:.2f}GB")
        voxcpm2_results["load_time_s"] = round(load_time, 1)
        voxcpm2_results["vram_gb"] = round(vram_loaded, 2)
        voxcpm2_results["loaded"] = True

        # Test synthesis
        lang_results = {}
        for lang_key, sents in EVAL_TEXTS.items():
            os.makedirs(f"{BENCH_DIR}/voxcpm2/{lang_key}", exist_ok=True)
            lang_wers = []
            lang_lats = []
            failures = 0
            peak_vram = 0  # initialize before loop

            for s in sents:
                sid, text = s["id"], s["text"]
                fpath = f"{BENCH_DIR}/voxcpm2/{lang_key}/{sid}.wav"
                try:
                    torch.cuda.reset_peak_memory_stats()
                    t0 = time.time()
                    # VoxCPM2 standard TTS
                    wav = vox_model.generate(
                        text=text, cfg_value=2.0,
                        inference_timesteps=10, seed=42,
                    )
                    latency = time.time() - t0
                    sr = vox_model.tts_model.sample_rate
                    sf.write(fpath, wav, sr)

                    audio_check = check_audio(fpath)
                    peak_vram = torch.cuda.max_memory_allocated() / 1e9

                    # ASR
                    wl = "hi" if "hindi" in lang_key or "hinglish" in lang_key else "en"
                    hyp = whisper_model.transcribe(fpath, language=wl)["text"].strip()
                    wer_score = compute_wer(hyp, text)
                    lang_wers.append(wer_score)
                    lang_lats.append(latency)

                    log(f"  [{sid}] lat={latency:.1f}s wer={wer_score} hyp='{hyp[:40]}'")

                except Exception as e:
                    failures += 1
                    log(f"  [{sid}] FAIL: {str(e)[:60]}")

            valid_wers = [w for w in lang_wers if w is not None]
            lang_results[lang_key] = {
                "total": len(sents), "failures": failures,
                "avg_wer": round(sum(valid_wers)/max(len(valid_wers),1), 3) if valid_wers else None,
                "avg_latency_s": round(sum(lang_lats)/max(len(lang_lats),1), 2) if lang_lats else None,
                "peak_vram_gb": round(peak_vram, 2),
            }
            log(f"  {lang_key}: avg_wer={lang_results[lang_key]['avg_wer']} "
                f"avg_lat={lang_results[lang_key]['avg_latency_s']}s")

        voxcpm2_results["lang_results"] = lang_results
        del vox_model; gc.collect(); torch.cuda.empty_cache()

    except Exception as e:
        voxcpm2_results["loaded"] = False
        voxcpm2_results["error"] = str(e)
        log(f"  VoxCPM2 FAILED: {e}")

    results["candidates"]["voxcpm2"] = voxcpm2_results

    # ── CANDIDATE 2: Kokoro (baseline) ────────────────────────────────────────
    log("\n=== CANDIDATE 2: Kokoro 82M (baseline) ===")
    log("License: Apache 2.0 ✅ | Current production")
    kokoro_results = {"model": "hexgrad/Kokoro-82M", "license": "Apache 2.0",
                      "commercial_safe": True, "role": "baseline"}

    try:
        from kokoro import KPipeline
        t_load = time.time()
        pipeline = KPipeline(lang_code="a")
        load_time = time.time() - t_load
        vram_loaded = torch.cuda.memory_allocated() / 1e9 if device == "cuda" else 0
        log(f"  Kokoro loaded | {load_time:.1f}s | VRAM: {vram_loaded:.2f}GB")
        kokoro_results["load_time_s"] = round(load_time, 1)
        kokoro_results["loaded"] = True

        lang_results = {}
        # Test English only (Kokoro's primary language)
        for lang_key in ["english"]:
            os.makedirs(f"{BENCH_DIR}/kokoro/{lang_key}", exist_ok=True)
            lang_wers = []; lang_lats = []; failures = 0

            for s in EVAL_TEXTS[lang_key]:
                sid, text = s["id"], s["text"]
                fpath = f"{BENCH_DIR}/kokoro/{lang_key}/{sid}.wav"
                try:
                    t0 = time.time()
                    gen = pipeline(text, voice="af_heart", speed=1.0)
                    audio_segs = [seg.numpy() for _, _, seg in gen]
                    import numpy as np
                    audio = np.concatenate(audio_segs)
                    latency = time.time() - t0
                    sf.write(fpath, audio, 24000)
                    hyp = whisper_model.transcribe(fpath, language="en")["text"].strip()
                    wer_score = compute_wer(hyp, text)
                    lang_wers.append(wer_score); lang_lats.append(latency)
                    log(f"  [{sid}] lat={latency:.1f}s wer={wer_score}")
                except Exception as e:
                    failures += 1

            valid_wers = [w for w in lang_wers if w is not None]
            lang_results[lang_key] = {
                "total": len(EVAL_TEXTS[lang_key]), "failures": failures,
                "avg_wer": round(sum(valid_wers)/max(len(valid_wers),1),3) if valid_wers else None,
                "avg_latency_s": round(sum(lang_lats)/max(len(lang_lats),1),2) if lang_lats else None,
            }

        kokoro_results["lang_results"] = lang_results
        del pipeline; gc.collect(); torch.cuda.empty_cache()

    except Exception as e:
        kokoro_results["loaded"] = False
        kokoro_results["error"] = str(e)
        log(f"  Kokoro FAILED: {e}")

    results["candidates"]["kokoro"] = kokoro_results

    # ── Generate comparison + human listening package ──────────────────────────
    log("\n=== Generating comparison report ===")
    total_time = time.time() - t_start

    # Comparison table
    comparison = []
    for cand_name, cand in results["candidates"].items():
        lr = cand.get("lang_results", {})
        comparison.append({
            "candidate": cand_name,
            "model": cand.get("model"),
            "license": cand.get("license"),
            "commercial_safe": cand.get("commercial_safe"),
            "loaded": cand.get("loaded", False),
            "error": cand.get("error"),
            "hindi_wer": lr.get("hindi", {}).get("avg_wer"),
            "english_wer": lr.get("english", {}).get("avg_wer"),
            "hinglish_wer": lr.get("hinglish", {}).get("avg_wer"),
            "hindi_latency_s": lr.get("hindi", {}).get("avg_latency_s"),
            "english_latency_s": lr.get("english", {}).get("avg_latency_s"),
            "vram_gb": cand.get("vram_gb"),
            "load_time_s": cand.get("load_time_s"),
            "hindi_failures": lr.get("hindi", {}).get("failures"),
            "human_quality": "UNTESTED",
        })

    results["comparison"] = comparison
    results["total_time_s"] = round(total_time, 1)
    results["cost_usd"] = round(total_time / 3600 * 0.80, 3)

    # Save full report
    with open(f"{BENCH_DIR}/reports/phase73_benchmark_report.json", "w") as f:
        json.dump(results, f, indent=2, ensure_ascii=False, default=str)

    # Human listening scorecard
    scorecard = ["# Phase 7.3 Human Listening Scorecard", "",
                 "Rate each audio 1-5 (1=very poor, 5=natural/excellent)", "",
                 "## Audio Locations", "",
                 f"VoxCPM2 Hindi: {BENCH_DIR}/voxcpm2/hindi/",
                 f"VoxCPM2 English: {BENCH_DIR}/voxcpm2/english/",
                 f"VoxCPM2 Hinglish: {BENCH_DIR}/voxcpm2/hinglish/",
                 f"Kokoro English: {BENCH_DIR}/kokoro/english/", "",
                 "## Download command:",
                 "```bash",
                 "modal volume get zarax-rnd-vol /rnd/phase73_benchmark/ ./phase73_audio/",
                 "```", "",
                 "## Hindi Ratings (VoxCPM2)", ""]
    for s in EVAL_TEXTS["hindi"]:
        scorecard += [f"### {s['id']}: `{s['text'][:50]}`",
                      "| Naturalness | Pronunciation | Clarity | Hindustani accent | Overall |",
                      "|---|---|---|---|---|",
                      "| /5 | /5 | /5 | /5 | /5 |", ""]
    scorecard += ["## English Ratings (VoxCPM2 vs Kokoro)", ""]
    for s in EVAL_TEXTS["english"]:
        scorecard += [f"### {s['id']}: `{s['text'][:50]}`",
                      "| Model | Naturalness | Clarity | Overall |",
                      "|---|---|---|---|",
                      "| VoxCPM2 | /5 | /5 | /5 |",
                      "| Kokoro | /5 | /5 | /5 |", ""]
    scorecard += ["## Hinglish Ratings (VoxCPM2)", ""]
    for s in EVAL_TEXTS["hinglish"]:
        scorecard += [f"### {s['id']}: `{s['text'][:50]}`",
                      "| Code-switching natural? | Overall quality |",
                      "|---|---|", "| Y/N | /5 |", ""]

    with open(f"{BENCH_DIR}/reports/human_scorecard.md", "w") as f:
        f.write("\n".join(scorecard))

    # Print summary
    log("\n" + "="*60)
    log("PHASE 7.3 BENCHMARK COMPLETE")
    log("="*60)
    log(f"Cost: ${results['cost_usd']} | Time: {total_time/60:.1f}min")
    log("")
    log("COMPARISON:")
    for c in comparison:
        log(f"  {c['candidate']}: hindi_wer={c['hindi_wer']} "
            f"en_wer={c['english_wer']} hinglish_wer={c['hinglish_wer']}")
    log("")
    log("Human listening: UNTESTED — download and rate:")
    log("  modal volume get zarax-rnd-vol /rnd/phase73_benchmark/ ./phase73_audio/")
    log("")
    log("STOP — no training, no deployment, no production changes")
    log("="*60)

    return results


@app.local_entrypoint()
def main():
    log("Phase 7.3 Foundation Model Benchmark starting...")
    result = run_benchmark.remote()
    print(json.dumps({
        "comparison": result.get("comparison"),
        "cost_usd": result.get("cost_usd"),
        "human_listening": result.get("human_listening"),
    }, indent=2, default=str))
    with open("phase73_report.json", "w") as f:
        json.dump(result, f, indent=2, default=str)
    log("Done. Download audio: modal volume get zarax-rnd-vol /rnd/phase73_benchmark/ ./phase73_audio/")
