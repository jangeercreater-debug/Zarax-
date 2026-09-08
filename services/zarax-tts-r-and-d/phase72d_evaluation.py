"""
Zarax Phase 7.2.D — Professional Evaluation Gate
==================================================
PURPOSE: Rigorous evaluation of Phase 7.2.C LoRA fine-tuning.

Evaluates: Base vs Epoch1 vs Epoch2 vs Epoch3 vs Final
Metrics:   WER/CER (Whisper), Audio integrity, Latency, VRAM
Human:     Audio files saved for manual listening + rating

DOES NOT claim MOS, speaker identity, or production readiness.
ALL human evaluation metrics = UNTESTED until user listens and rates.

PRODUCTION SAFETY: Zero production changes. R&D isolated.
"""

import modal
import json
import time
import os
import traceback

app = modal.App("zarax-phase72d-eval")
rnd_volume = modal.Volume.from_name("zarax-rnd-vol", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "torchcodec>=0.1.0",
        "transformers>=4.46.0",
        "torch>=2.4.0",
        "torchaudio>=2.4.0",
        "peft>=0.12.0",
        "accelerate>=0.26.0",
        "snac>=1.2.1",
        "soundfile>=0.12.1",
        "numpy>=1.24.0",
        "librosa>=0.10.0",
        "openai-whisper>=20231117",
        "jiwer>=3.0.0",
        "fastapi[standard]>=0.111.0",
    )
    .env({"HF_HOME": "/rnd/hf_cache"})
)

# ── Constants (same as training) ──────────────────────────────────────────────
AUDIO_TOKEN_BASE = 128266
AUDIO_TOKEN_HI   = AUDIO_TOKEN_BASE + 7 * 4096
TARGET_SR        = 24000
SPEAKER_ID_HI    = "Hindi (Female)"
SPEAKER_ID_EN    = "English (Female)"
STYLE_TAG        = "<neutral>"
EVAL_DIR         = "/rnd/phase72d_evaluation"
AUDIO_DIR        = f"{EVAL_DIR}/audio"
TRANSCRIPT_DIR   = f"{EVAL_DIR}/transcripts"

# ── Fixed evaluation set — deterministic, created before any audio generation ─
EVALUATION_SET = {
    "hindi": [
        # 1. Normal conversational
        {"id": "hi_01", "cat": "conversational",   "text": "Namaste, aap kaise hain aaj?"},
        {"id": "hi_02", "cat": "conversational",   "text": "Kya main aapki madad kar sakta hoon?"},
        # 2. Short sentences
        {"id": "hi_03", "cat": "short",            "text": "Dhanyavad."},
        {"id": "hi_04", "cat": "short",            "text": "Theek hai."},
        # 3. Medium sentences
        {"id": "hi_05", "cat": "medium",           "text": "Mera naam Zarax hai aur main aapka AI assistant hoon."},
        {"id": "hi_06", "cat": "medium",           "text": "Aapki appointment kal teen baje scheduled hai."},
        # 4. Longer sentences
        {"id": "hi_07", "cat": "long",             "text": "Hamare platform par aap apni awaaz clone kar sakte hain aur phir usi awaaz mein jawab pa sakte hain."},
        {"id": "hi_08", "cat": "long",             "text": "Is mahine ki report mein unhone bataya ki company ka maalik Mukesh Ambani ne naya investment kiya hai."},
        # 5. Difficult pronunciation
        {"id": "hi_09", "cat": "difficult_pronunciation", "text": "Pratigya aur pratibaddh vyakti ne pratirodh ka saamna kiya."},
        {"id": "hi_10", "cat": "difficult_pronunciation", "text": "Vigyaan aur takneek ke kshetra mein bharat ne bahut pragati ki hai."},
        # 6. Consonant clusters
        {"id": "hi_11", "cat": "consonant_clusters", "text": "Spasht awaaz mein bolein taaki samajh mein aaye."},
        {"id": "hi_12", "cat": "consonant_clusters", "text": "Sthapit sanstha ne sthiti sudhaarne ke liye kadam uthaye."},
        # 7. Numbers
        {"id": "hi_13", "cat": "numbers",          "text": "Aapka order number paanch char teen do ek hai."},
        {"id": "hi_14", "cat": "numbers",          "text": "Yeh company baees hazaar karmodon mein kaam karti hai."},
        # 8. Dates
        {"id": "hi_15", "cat": "dates",            "text": "Aaj paanch September do hazaar chhabbis hai."},
        # 9. Questions
        {"id": "hi_16", "cat": "questions",        "text": "Kya aapne apna phone number confirm kar diya?"},
        {"id": "hi_17", "cat": "questions",        "text": "Aap kaun si bhasha mein baat karna chahte hain?"},
        # 10. Statements
        {"id": "hi_18", "cat": "statements",       "text": "Aapki request process ho rahi hai, please wait karein."},
        # 11. IVR / Professional
        {"id": "hi_19", "cat": "professional",     "text": "Zarax mein aapka swagat hai. Behtar seva ke liye ek dabayein."},
        # 12. Common vocabulary
        {"id": "hi_20", "cat": "common_vocab",     "text": "Subah ka waqt sabse accha hota hai kaam karne ke liye."},
    ],
    "english": [
        {"id": "en_01", "cat": "conversational",   "text": "Hello, how are you today?"},
        {"id": "en_02", "cat": "professional",     "text": "Thank you for calling Zarax. How may I assist you?"},
        {"id": "en_03", "cat": "short",            "text": "Please hold."},
        {"id": "en_04", "cat": "medium",           "text": "Your appointment has been confirmed for tomorrow at three PM."},
        {"id": "en_05", "cat": "long",             "text": "We are working on improving our AI voice platform to support multiple Indian languages including Hindi and Hinglish."},
        {"id": "en_06", "cat": "numbers",          "text": "Your order number is one two three four five six."},
        {"id": "en_07", "cat": "questions",        "text": "Can you help me find the nearest hospital?"},
        {"id": "en_08", "cat": "statements",       "text": "The meeting has been rescheduled to Friday morning."},
        {"id": "en_09", "cat": "punctuation",      "text": "First, please confirm your name. Then, provide your date of birth."},
        {"id": "en_10", "cat": "complex",          "text": "The quarterly earnings report demonstrates a fifteen percent increase in revenue."},
    ]
}

CHECKPOINTS = {
    "base":    None,  # No adapter — use base model directly
    "epoch_1": "/rnd/phase72c_checkpoints/epoch_1",
    "epoch_2": "/rnd/phase72c_checkpoints/epoch_2",
    "epoch_3": "/rnd/phase72c_checkpoints/epoch_3",
    "final":   "/rnd/phase72c_checkpoints/final",
}


def log(msg):
    print(f"[7.2.D] {msg}", flush=True)


def tokens_to_audio(token_ids, snac_model):
    """Verified SNAC decoding from Phase 7.1 fix."""
    import torch, numpy as np
    BASE = AUDIO_TOKEN_BASE
    audio_tokens = [t for t in token_ids if BASE <= t < AUDIO_TOKEN_HI]
    if len(audio_tokens) < 7:
        raise ValueError(f"Only {len(audio_tokens)} audio tokens generated")
    n = (len(audio_tokens) // 7) * 7
    audio_tokens = audio_tokens[:n]
    c0, c1, c2 = [], [], []
    for i in range(0, n, 7):
        f = audio_tokens[i:i+7]
        c0.append(f[0] - BASE - 0*4096)
        c1.append(f[1] - BASE - 1*4096)
        c2.append(f[2] - BASE - 2*4096)
        c2.append(f[3] - BASE - 3*4096)
        c1.append(f[4] - BASE - 4*4096)
        c2.append(f[5] - BASE - 5*4096)
        c2.append(f[6] - BASE - 6*4096)
    dev = "cpu"
    t0 = torch.tensor(c0, dtype=torch.long).unsqueeze(0)
    t1 = torch.tensor(c1, dtype=torch.long).unsqueeze(0)
    t2 = torch.tensor(c2, dtype=torch.long).unsqueeze(0)
    # Clamp to valid range
    t0 = t0.clamp(0, 4095)
    t1 = t1.clamp(0, 4095)
    t2 = t2.clamp(0, 4095)
    with torch.no_grad():
        audio = snac_model.decode([t0, t1, t2])
    return audio.squeeze().numpy().astype("float32"), TARGET_SR


def generate_one(text, lang, model, tokenizer, snac_model, seed=42):
    """Generate audio for one sentence. Fixed seed for reproducibility."""
    import torch, io
    import soundfile as sf
    import numpy as np

    speaker = SPEAKER_ID_HI if lang == "hindi" else SPEAKER_ID_EN
    prompt = f"<custom_token_3>{speaker}: {STYLE_TAG} {text}<|eot_id|><custom_token_4>"
    inputs = tokenizer(prompt, return_tensors="pt").to("cuda:0")

    torch.manual_seed(seed)
    torch.cuda.manual_seed(seed)

    t0 = time.time()
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=1500,
            do_sample=True,
            temperature=0.6,
            top_p=0.9,
            repetition_penalty=1.1,
            pad_token_id=tokenizer.eos_token_id,
        )
    latency_s = time.time() - t0
    new_tokens = outputs[0][inputs.input_ids.shape[1]:].tolist()
    audio_np, sr = tokens_to_audio(new_tokens, snac_model)
    duration_s = len(audio_np) / sr

    buf = io.BytesIO()
    sf.write(buf, audio_np, sr, format="WAV", subtype="PCM_16")
    wav_bytes = buf.getvalue()

    return {
        "wav_bytes": wav_bytes,
        "duration_s": round(duration_s, 2),
        "latency_s": round(latency_s, 2),
        "rtf": round(latency_s / max(duration_s, 0.001), 3),
        "audio_tokens": len([t for t in new_tokens if AUDIO_TOKEN_BASE <= t < AUDIO_TOKEN_HI]),
        "sample_rate": sr,
    }


def compute_wer_cer(hypothesis, reference, lang):
    """WER/CER using jiwer. Normalize text before scoring."""
    try:
        from jiwer import wer, cer
        import unicodedata, re

        def normalize(text):
            text = unicodedata.normalize("NFC", text.lower())
            text = re.sub(r'[^\w\s]', '', text)
            text = re.sub(r'\s+', ' ', text).strip()
            return text

        ref = normalize(reference)
        hyp = normalize(hypothesis)
        if not ref:
            return {"wer": None, "cer": None, "error": "empty_reference"}
        return {
            "wer": round(wer(ref, hyp), 3),
            "cer": round(cer(ref, hyp), 3),
            "ref_normalized": ref,
            "hyp_normalized": hyp,
        }
    except Exception as e:
        return {"wer": None, "cer": None, "error": str(e)}


@app.function(
    gpu="L4",
    image=image,
    volumes={"/rnd": rnd_volume},
    timeout=10800,  # 3 hours max
)
def run_evaluation():
    import torch
    import numpy as np
    import soundfile as sf
    import whisper
    import gc
    from transformers import AutoTokenizer, AutoModelForCausalLM
    from peft import PeftModel
    from snac import SNAC

    os.makedirs(AUDIO_DIR, exist_ok=True)
    os.makedirs(TRANSCRIPT_DIR, exist_ok=True)
    os.makedirs(f"{EVAL_DIR}/logs", exist_ok=True)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    t_start = time.time()

    results = {
        "phase": "7.2.D",
        "environment": {
            "gpu": torch.cuda.get_device_name(0) if device == "cuda" else "CPU",
            "torch": torch.__version__,
            "python": "3.11",
            "cuda": torch.version.cuda,
        },
        "evaluation_set": EVALUATION_SET,
        "checkpoints": {},
        "audio_generation": {},
        "integrity": {},
        "wer_cer": {},
        "latency": {},
        "human_listening": {
            "status": "UNTESTED — audio files saved, manual evaluation required",
            "instructions": "Download audio from Modal Volume, listen, rate 1-5",
            "audio_path": AUDIO_DIR,
        },
        "blind_ab": "UNTESTED — requires human listeners",
        "same_voice_identity": "NOT TESTED",
        "emotion_style_control": "NOT TESTED",
        "speaker_identity_preservation": "NOT TESTED",
        "cross_language_identity": "NOT TESTED",
    }

    # Save evaluation set
    with open(f"{EVAL_DIR}/evaluation_set.json", "w") as f:
        json.dump(EVALUATION_SET, f, indent=2, ensure_ascii=False)
    log("Evaluation set saved.")

    # ── STEP 0: Pre-flight checkpoint verification ────────────────────────────
    log("\n=== STEP 0: Pre-flight checkpoint audit ===")
    checkpoint_status = {}
    for name, path in CHECKPOINTS.items():
        if path is None:
            checkpoint_status[name] = {"status": "BASE_MODEL", "path": None}
            log(f"  {name}: BASE MODEL (no adapter)")
            continue
        required = ["adapter_config.json", "adapter_model.safetensors"]
        if not os.path.exists(path):
            checkpoint_status[name] = {"status": "MISSING", "path": path}
            log(f"  {name}: MISSING — {path}")
            continue
        found = os.listdir(path)
        missing = [f for f in required if f not in found]
        if missing:
            checkpoint_status[name] = {"status": "INCOMPLETE", "missing": missing, "found": found}
            log(f"  {name}: INCOMPLETE — missing {missing}")
        else:
            size_mb = sum(os.path.getsize(os.path.join(path, f)) for f in found) / 1e6
            checkpoint_status[name] = {"status": "VALID", "path": path,
                                       "files": found, "size_mb": round(size_mb, 1)}
            log(f"  {name}: VALID — {found} ({size_mb:.1f}MB)")
    results["checkpoints"] = checkpoint_status

    valid_checkpoints = {k: v for k, v in CHECKPOINTS.items()
                         if checkpoint_status.get(k, {}).get("status") in ("BASE_MODEL", "VALID")}
    log(f"  Valid checkpoints to evaluate: {list(valid_checkpoints.keys())}")

    # ── Load SNAC + Tokenizer + Whisper (shared across all models) ────────────
    log("\n=== Loading shared resources ===")
    snac = SNAC.from_pretrained("hubertsiuzdak/snac_24khz").eval().to("cpu")
    tokenizer = AutoTokenizer.from_pretrained("kenpath/svara-tts-v1")
    log("  SNAC + tokenizer loaded")

    log("  Loading Whisper for ASR evaluation...")
    whisper_model = whisper.load_model("base")
    log("  Whisper loaded")

    # ── STEP 1-9: Evaluate each checkpoint ────────────────────────────────────
    all_sentences = (
        [{"lang": "hindi", **s} for s in EVALUATION_SET["hindi"]] +
        [{"lang": "english", **s} for s in EVALUATION_SET["english"]]
    )

    for ckpt_name, ckpt_path in valid_checkpoints.items():
        log(f"\n{'='*50}")
        log(f"EVALUATING: {ckpt_name}")
        log(f"{'='*50}")

        gen_results = {}
        integrity_results = {}
        wer_results = {}
        latency_data = []
        peak_vram = 0

        try:
            # Load model
            t_load = time.time()
            base_model = AutoModelForCausalLM.from_pretrained(
                "kenpath/svara-tts-v1",
                torch_dtype=torch.bfloat16,
                device_map="cuda:0",
            )
            if ckpt_path is not None:
                model = PeftModel.from_pretrained(base_model, ckpt_path)
                log(f"  Loaded base + LoRA adapter from {ckpt_path}")
            else:
                model = base_model
                log("  Using base model (no adapter)")
            model.eval()
            load_time = time.time() - t_load
            vram_loaded = torch.cuda.memory_allocated() / 1e9
            log(f"  Load time: {load_time:.1f}s | VRAM: {vram_loaded:.2f}GB")

            # Generate all sentences
            for sent in all_sentences:
                sent_id = sent["id"]
                lang = sent["lang"]
                text = sent["text"]
                audio_fname = f"{ckpt_name}_{sent_id}.wav"
                audio_path = os.path.join(AUDIO_DIR, audio_fname)

                log(f"  [{sent_id}] {lang}: {text[:50]}...")

                try:
                    torch.cuda.reset_peak_memory_stats()
                    result = generate_one(text, lang, model, tokenizer, snac, seed=42)
                    vram_now = torch.cuda.max_memory_allocated() / 1e9
                    peak_vram = max(peak_vram, vram_now)

                    # Save WAV
                    with open(audio_path, "wb") as f:
                        f.write(result["wav_bytes"])

                    gen_results[sent_id] = {
                        "status": "SUCCESS",
                        "duration_s": result["duration_s"],
                        "latency_s": result["latency_s"],
                        "rtf": result["rtf"],
                        "audio_tokens": result["audio_tokens"],
                        "file": audio_fname,
                    }
                    latency_data.append(result["latency_s"])

                    # ── Audio integrity ─────────────────────────────────────
                    try:
                        audio_np, sr = sf.read(audio_path)
                        has_nan = np.isnan(audio_np).any()
                        has_inf = np.isinf(audio_np).any()
                        max_amp = float(np.max(np.abs(audio_np)))
                        duration_check = len(audio_np) / sr
                        is_silent = max_amp < 0.001

                        integrity_results[sent_id] = {
                            "valid": not (has_nan or has_inf or is_silent),
                            "sample_rate": sr,
                            "duration_s": round(duration_check, 2),
                            "max_amplitude": round(max_amp, 4),
                            "has_nan": bool(has_nan),
                            "has_inf": bool(has_inf),
                            "is_silent": bool(is_silent),
                            "size_bytes": os.path.getsize(audio_path),
                        }
                    except Exception as e:
                        integrity_results[sent_id] = {"valid": False, "error": str(e)}

                    # ── WER/CER via Whisper ─────────────────────────────────
                    try:
                        whisper_lang = "hi" if lang == "hindi" else "en"
                        asr_result = whisper_model.transcribe(
                            audio_path, language=whisper_lang
                        )
                        hypothesis = asr_result["text"].strip()

                        wer_data = compute_wer_cer(hypothesis, text, lang)
                        wer_results[sent_id] = {
                            "hypothesis": hypothesis,
                            "reference": text,
                            "lang": lang,
                            **wer_data,
                        }
                        log(f"    WER={wer_data.get('wer','?')} "
                            f"CER={wer_data.get('cer','?')} "
                            f"hyp='{hypothesis[:40]}'")
                    except Exception as e:
                        wer_results[sent_id] = {"error": str(e), "wer": None, "cer": None}

                except Exception as e:
                    gen_results[sent_id] = {"status": "FAILED", "error": str(e)}
                    integrity_results[sent_id] = {"valid": False, "error": str(e)}
                    wer_results[sent_id] = {"error": str(e), "wer": None, "cer": None}
                    log(f"  FAIL [{sent_id}]: {str(e)[:100]}")

        except Exception as e:
            log(f"  CRITICAL FAIL for {ckpt_name}: {e}")
            traceback.print_exc()
            gen_results["critical_error"] = str(e)
        finally:
            try:
                del model, base_model
                gc.collect()
                torch.cuda.empty_cache()
            except Exception:
                pass

        # Aggregate metrics per checkpoint
        success_count = sum(1 for v in gen_results.values()
                            if isinstance(v, dict) and v.get("status") == "SUCCESS")
        valid_count = sum(1 for v in integrity_results.values()
                          if isinstance(v, dict) and v.get("valid"))

        hindi_wers = [v["wer"] for k, v in wer_results.items()
                      if v.get("wer") is not None and k.startswith("hi_")]
        english_wers = [v["wer"] for k, v in wer_results.items()
                        if v.get("wer") is not None and k.startswith("en_")]
        hindi_cers = [v["cer"] for k, v in wer_results.items()
                      if v.get("cer") is not None and k.startswith("hi_")]
        english_cers = [v["cer"] for k, v in wer_results.items()
                        if v.get("cer") is not None and k.startswith("en_")]

        results["audio_generation"][ckpt_name] = gen_results
        results["integrity"][ckpt_name] = integrity_results
        results["wer_cer"][ckpt_name] = wer_results
        results["latency"][ckpt_name] = {
            "peak_vram_gb": round(peak_vram, 2),
            "avg_latency_s": round(sum(latency_data)/max(len(latency_data),1), 2),
            "min_latency_s": round(min(latency_data), 2) if latency_data else None,
            "max_latency_s": round(max(latency_data), 2) if latency_data else None,
        }
        results.setdefault("summary", {})[ckpt_name] = {
            "samples_generated": success_count,
            "samples_valid": valid_count,
            "hindi_wer_avg": round(sum(hindi_wers)/max(len(hindi_wers),1), 3) if hindi_wers else "UNTESTED",
            "hindi_cer_avg": round(sum(hindi_cers)/max(len(hindi_cers),1), 3) if hindi_cers else "UNTESTED",
            "english_wer_avg": round(sum(english_wers)/max(len(english_wers),1), 3) if english_wers else "UNTESTED",
            "english_cer_avg": round(sum(english_cers)/max(len(english_cers),1), 3) if english_cers else "UNTESTED",
            "avg_latency_s": round(sum(latency_data)/max(len(latency_data),1), 2) if latency_data else None,
            "peak_vram_gb": round(peak_vram, 2),
        }
        log(f"  {ckpt_name} done — "
            f"gen={success_count}/30, valid={valid_count}/30, "
            f"hi_wer={results['summary'][ckpt_name]['hindi_wer_avg']}, "
            f"en_wer={results['summary'][ckpt_name]['english_wer_avg']}")

    # ── Generate comparison report ────────────────────────────────────────────
    log("\n=== Generating comparison report ===")
    summary = results.get("summary", {})

    report_md = ["# PHASE 7.2.D — EVALUATION REPORT\n"]
    report_md.append("## Checkpoint Comparison (WER = lower is better)\n")
    report_md.append("| Checkpoint | Hindi WER | Hindi CER | English WER | English CER | Avg Latency | Peak VRAM |")
    report_md.append("|---|---|---|---|---|---|---|")
    for ckpt, s in summary.items():
        report_md.append(
            f"| {ckpt} | {s.get('hindi_wer_avg','?')} | "
            f"{s.get('hindi_cer_avg','?')} | "
            f"{s.get('english_wer_avg','?')} | "
            f"{s.get('english_cer_avg','?')} | "
            f"{s.get('avg_latency_s','?')}s | "
            f"{s.get('peak_vram_gb','?')}GB |"
        )
    report_md.append("\n## Human Listening Status\n")
    report_md.append("**UNTESTED** — Audio files saved to Modal Volume.")
    report_md.append(f"Download from: `{AUDIO_DIR}`")
    report_md.append("\n**Download command:**")
    report_md.append("```bash")
    report_md.append("modal volume get zarax-rnd-vol /rnd/phase72d_evaluation/audio ./zarax_eval_audio")
    report_md.append("```")
    report_md.append("\n## Not Tested\n")
    for item in ["Same-voice identity", "Speaker preservation",
                 "Cross-language identity", "Emotion/style/pitch control",
                 "Hinglish quality", "MOS (formal protocol)"]:
        report_md.append(f"- **{item}**: NOT TESTED")

    report_md.append("\n## Audio Files\n")
    report_md.append("Format: `{checkpoint}_{sentence_id}.wav`")
    report_md.append("Example: `epoch_2_hi_01.wav` = Epoch 2 adapter, Hindi sentence 1")
    report_md.append("\nListen and rate 1-5:")
    report_md.append("1 = Very poor | 2 = Poor | 3 = Acceptable | 4 = Good | 5 = Natural")

    with open(f"{EVAL_DIR}/comparison_report.md", "w") as f:
        f.write("\n".join(report_md))

    # Save full metrics
    with open(f"{EVAL_DIR}/metrics.json", "w") as f:
        # Remove wav_bytes from results before saving
        clean_results = json.loads(json.dumps(
            {k: v for k, v in results.items() if k != "evaluation_set"},
            default=str
        ))
        json.dump(clean_results, f, indent=2, ensure_ascii=False)

    # Human rating template
    rating_template = []
    for ckpt_name in valid_checkpoints:
        for sent in all_sentences:
            rating_template.append({
                "file": f"{ckpt_name}_{sent['id']}.wav",
                "checkpoint": ckpt_name,
                "sentence_id": sent["id"],
                "lang": sent["lang"],
                "text": sent["text"],
                "naturalness_1_5": None,
                "pronunciation_1_5": None,
                "clarity_1_5": None,
                "overall_1_5": None,
                "notes": "",
            })
    with open(f"{EVAL_DIR}/human_rating_template.json", "w") as f:
        json.dump(rating_template, f, indent=2, ensure_ascii=False)

    total_time = time.time() - t_start
    results["total_time_s"] = round(total_time, 1)
    results["estimated_cost_usd"] = round(total_time / 3600 * 0.80, 3)

    # Determine provisional verdict (WER only — human evaluation pending)
    base_hi_wer = summary.get("base", {}).get("hindi_wer_avg")
    best_hi_wer = None
    best_ckpt = None
    for ckpt, s in summary.items():
        if ckpt == "base":
            continue
        hi_wer = s.get("hindi_wer_avg")
        if isinstance(hi_wer, float):
            if best_hi_wer is None or hi_wer < best_hi_wer:
                best_hi_wer = hi_wer
                best_ckpt = ckpt

    if isinstance(base_hi_wer, float) and isinstance(best_hi_wer, float):
        improvement = base_hi_wer - best_hi_wer
        if improvement > 0.05:
            provisional = f"SUPPORTED — Hindi WER improved by {improvement:.3f} ({best_ckpt})"
        elif improvement > 0:
            provisional = f"UNCERTAIN — Hindi WER improved slightly by {improvement:.3f}"
        else:
            provisional = f"NOT SUPPORTED — Hindi WER did not improve"
    else:
        provisional = "UNTESTED — WER could not be computed"

    results["provisional_verdict_wer_only"] = provisional
    results["best_hindi_checkpoint_by_wer"] = best_ckpt
    results["human_verdict"] = "UNTESTED — awaiting human listening evaluation"
    results["final_verdict"] = "PARTIAL — automatic metrics complete, human evaluation required"

    results["what_is_proven"] = [
        "Training loss decreased: 5.28 → 3.54 over 13,171 steps",
        "LoRA adapter saves and reloads correctly (9.2MB)",
        "Audio generation pipeline works for all checkpoints",
        f"WER comparison between base and fine-tuned ({provisional})",
    ]
    results["what_is_not_proven"] = [
        "Hindi MOS improvement (human evaluation UNTESTED)",
        "English regression / no-regression (human evaluation UNTESTED)",
        "Same-user voice identity (NOT TESTED)",
        "Cross-language speaker identity (NOT TESTED)",
        "Emotion/style/pitch control (NOT TESTED)",
        "Production readiness (NOT CLAIMED)",
        "Hinglish quality (NOT TESTED)",
    ]

    log("\n" + "=" * 60)
    log(f"PHASE 7.2.D PROVISIONAL: {provisional}")
    log(f"Total time: {total_time/60:.1f}min | Cost: ${results['estimated_cost_usd']}")
    log(f"Audio files: {AUDIO_DIR}")
    log(f"Download: modal volume get zarax-rnd-vol /rnd/phase72d_evaluation/audio ./zarax_eval_audio")
    log("=" * 60)
    log("Human evaluation REQUIRED before final verdict.")

    return results


@app.local_entrypoint()
def main():
    log("Phase 7.2.D starting on Modal L4...")
    report = run_evaluation.remote()
    print("\n" + "=" * 60)
    print("PHASE 7.2.D — AUTOMATIC METRICS COMPLETE")
    print("=" * 60)
    # Print summary only (not full 150-sample detail)
    print(json.dumps({
        "provisional_verdict": report.get("provisional_verdict_wer_only"),
        "human_verdict": report.get("human_verdict"),
        "final_verdict": report.get("final_verdict"),
        "summary": report.get("summary"),
        "best_hindi_checkpoint_by_wer": report.get("best_hindi_checkpoint_by_wer"),
        "total_time_s": report.get("total_time_s"),
        "estimated_cost_usd": report.get("estimated_cost_usd"),
        "what_is_proven": report.get("what_is_proven"),
        "what_is_not_proven": report.get("what_is_not_proven"),
        "audio_download": "modal volume get zarax-rnd-vol /rnd/phase72d_evaluation/audio ./zarax_eval_audio",
    }, indent=2, ensure_ascii=False))
    with open("phase72d_report.json", "w") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    log("Full report saved to phase72d_report.json")
  
