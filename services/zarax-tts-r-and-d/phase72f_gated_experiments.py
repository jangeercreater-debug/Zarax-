"""
Zarax Phase 7.2.F — Controlled Root-Cause Fix Validation (BUGFIX v2)
======================================================================
BUGS FIXED vs v1:
  BUG 1: SNAC device mismatch — audio_t.to(device) but snac on CPU
          Fix: use snac_model's own device for encoding
  BUG 2: gradient_checkpointing disables KV cache → broken generation
          Fix: model.eval() + use_cache=True before evaluation

KEY FINDING from v1 base eval:
  Base model ALREADY generates END_OF_SPEECH (128258 = <custom_token_2>)
  EOS IS the correct stopping token — training with EOS in labels is VALID

F1: EOS fix ONLY (single variable)
F2: EOS + LR 5e-5 (if F1 passes)
F3: EOS + LR 5e-5 + OOM prevention (if F2 passes)
"""

import modal
import json
import time
import os
import traceback
import gc

app = modal.App("zarax-phase72f-gated")
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
        "datasets>=2.20.0",
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

AUDIO_TOKEN_BASE = 128266
AUDIO_TOKEN_HI   = AUDIO_TOKEN_BASE + 7 * 4096
END_OF_SPEECH    = 128258
TARGET_SR        = 24000
MAX_SEQ_LEN      = 768
BATCH_SIZE       = 1
GRAD_ACCUM       = 4
SPEAKER_ID       = "Hindi (Female)"
STYLE_TAG        = "<neutral>"
BASE_DIR         = "/rnd/phase72f_v2"

BASELINE_HINDI_WER_BASE    = 0.900
BASELINE_HINDI_WER_100STEP = 0.989
BASELINE_ENGLISH_WER_BASE  = 0.155
BASELINE_ENGLISH_WER_72C   = 0.562

GATE_F1_HINDI_WER_MAX   = 0.989
GATE_F1_ENGLISH_WER_MAX = 0.400
GATE_F2_ENGLISH_WER_MAX = 0.300

EVAL_SET = {
    "hindi": [
        {"id": "hi_01", "text": "Namaste, aap kaise hain aaj?"},
        {"id": "hi_02", "text": "Kya main aapki madad kar sakta hoon?"},
        {"id": "hi_03", "text": "Dhanyavad."},
        {"id": "hi_04", "text": "Theek hai."},
        {"id": "hi_05", "text": "Mera naam Zarax hai aur main aapka AI assistant hoon."},
        {"id": "hi_06", "text": "Aapki appointment kal teen baje scheduled hai."},
        {"id": "hi_07", "text": "Hamare platform par aap apni awaaz clone kar sakte hain aur phir usi awaaz mein jawab pa sakte hain."},
        {"id": "hi_08", "text": "Is mahine ki report mein unhone bataya ki company ka maalik Mukesh Ambani ne naya investment kiya hai."},
        {"id": "hi_09", "text": "Pratigya aur pratibaddh vyakti ne pratirodh ka saamna kiya."},
        {"id": "hi_10", "text": "Vigyaan aur takneek ke kshetra mein bharat ne bahut pragati ki hai."},
        {"id": "hi_11", "text": "Spasht awaaz mein bolein taaki samajh mein aaye."},
        {"id": "hi_12", "text": "Sthapit sanstha ne sthiti sudhaarne ke liye kadam uthaye."},
        {"id": "hi_13", "text": "Aapka order number paanch char teen do ek hai."},
        {"id": "hi_14", "text": "Yeh company baees hazaar karmodon mein kaam karti hai."},
        {"id": "hi_15", "text": "Aaj paanch September do hazaar chhabbis hai."},
        {"id": "hi_16", "text": "Kya aapne apna phone number confirm kar diya?"},
        {"id": "hi_17", "text": "Aap kaun si bhasha mein baat karna chahte hain?"},
        {"id": "hi_18", "text": "Aapki request process ho rahi hai, please wait karein."},
        {"id": "hi_19", "text": "Zarax mein aapka swagat hai. Behtar seva ke liye ek dabayein."},
        {"id": "hi_20", "text": "Subah ka waqt sabse accha hota hai kaam karne ke liye."},
    ],
    "english": [
        {"id": "en_01", "text": "Hello, how are you today?"},
        {"id": "en_02", "text": "Thank you for calling Zarax. How may I assist you?"},
        {"id": "en_03", "text": "Please hold."},
        {"id": "en_04", "text": "Your appointment has been confirmed for tomorrow at three PM."},
        {"id": "en_05", "text": "We are working on improving our AI voice platform to support multiple Indian languages including Hindi and Hinglish."},
        {"id": "en_06", "text": "Your order number is one two three four five six."},
        {"id": "en_07", "text": "Can you help me find the nearest hospital?"},
        {"id": "en_08", "text": "The meeting has been rescheduled to Friday morning."},
        {"id": "en_09", "text": "First, please confirm your name. Then, provide your date of birth."},
        {"id": "en_10", "text": "The quarterly earnings report demonstrates a fifteen percent increase in revenue."},
    ],
}


def log(msg):
    print(f"[7.2.F] {msg}", flush=True)


def tokens_to_audio(token_ids, snac_model):
    import torch, numpy as np
    audio_tokens = [t for t in token_ids if AUDIO_TOKEN_BASE <= t < AUDIO_TOKEN_HI]
    if len(audio_tokens) < 7:
        return None, 0
    n = (len(audio_tokens) // 7) * 7
    audio_tokens = audio_tokens[:n]
    c0, c1, c2 = [], [], []
    for i in range(0, n, 7):
        f = audio_tokens[i:i+7]
        c0.append(f[0] - AUDIO_TOKEN_BASE - 0*4096)
        c1.append(f[1] - AUDIO_TOKEN_BASE - 1*4096)
        c2.append(f[2] - AUDIO_TOKEN_BASE - 2*4096)
        c2.append(f[3] - AUDIO_TOKEN_BASE - 3*4096)
        c1.append(f[4] - AUDIO_TOKEN_BASE - 4*4096)
        c2.append(f[5] - AUDIO_TOKEN_BASE - 5*4096)
        c2.append(f[6] - AUDIO_TOKEN_BASE - 6*4096)
    # Always use CPU for SNAC (snac_model is on CPU)
    t0 = torch.tensor(c0).clamp(0, 4095).unsqueeze(0)
    t1 = torch.tensor(c1).clamp(0, 4095).unsqueeze(0)
    t2 = torch.tensor(c2).clamp(0, 4095).unsqueeze(0)
    with torch.no_grad():
        audio = snac_model.decode([t0, t1, t2])
    return audio.squeeze().numpy().astype("float32"), TARGET_SR


def make_sequence_corrected(text_ids, audio_ids, max_len):
    """Corrected format: text → audio → END_OF_SPEECH."""
    import torch
    n_audio = (min(max_len - len(text_ids) - 1, len(audio_ids)) // 7) * 7
    seq = text_ids + audio_ids[:n_audio] + [END_OF_SPEECH]
    input_ids = torch.tensor(seq, dtype=torch.long).unsqueeze(0)
    labels = input_ids.clone()
    labels[:, :len(text_ids)] = -100
    return input_ids, labels


def audio_to_tokens(audio_np, sr, snac_model):
    """
    BUGFIX v2: Use snac_model's device, NOT main GPU device.
    snac_model is on CPU — audio must also be on CPU for encoding.
    """
    import torch, librosa
    if sr != TARGET_SR:
        audio_np = librosa.resample(audio_np.astype("float32"),
                                    orig_sr=sr, target_sr=TARGET_SR)
    # FIX: always use CPU (snac's device), not main training device
    snac_device = next(snac_model.parameters()).device
    audio_t = torch.tensor(audio_np, dtype=torch.float32).unsqueeze(0).unsqueeze(0).to(snac_device)
    with torch.no_grad():
        codes = snac_model.encode(audio_t)
    c0 = codes[0].squeeze().cpu().tolist()
    c1 = codes[1].squeeze().cpu().tolist()
    c2 = codes[2].squeeze().cpu().tolist()
    tokens = []
    for i in range(len(c0)):
        frame = [
            c0[i]     + AUDIO_TOKEN_BASE + 0*4096,
            c1[2*i]   + AUDIO_TOKEN_BASE + 1*4096,
            c2[4*i]   + AUDIO_TOKEN_BASE + 2*4096,
            c2[4*i+1] + AUDIO_TOKEN_BASE + 3*4096,
            c1[2*i+1] + AUDIO_TOKEN_BASE + 4*4096,
            c2[4*i+2] + AUDIO_TOKEN_BASE + 5*4096,
            c2[4*i+3] + AUDIO_TOKEN_BASE + 6*4096,
        ]
        if all(AUDIO_TOKEN_BASE <= t < AUDIO_TOKEN_HI for t in frame):
            tokens.extend(frame)
    return tokens


def evaluate_model(model, tokenizer, snac_model, whisper_model, device, label, audio_dir):
    """
    BUGFIX v2:
    - model.eval() explicitly (was missing)
    - model.config.use_cache = True (gradient_checkpointing disables it)
    """
    import torch, soundfile as sf
    from jiwer import wer as compute_wer
    import unicodedata, re

    # FIX: set eval mode + re-enable KV cache
    model.eval()
    if hasattr(model, 'config'):
        model.config.use_cache = True

    def norm(t):
        t = unicodedata.normalize("NFC", t.lower())
        return re.sub(r'\s+', ' ', re.sub(r'[^\w\s]', '', t)).strip()

    results = []
    for lang, sentences in [("hindi", EVAL_SET["hindi"]), ("english", EVAL_SET["english"])]:
        speaker = SPEAKER_ID if lang == "hindi" else "English (Female)"
        for sent in sentences:
            text = sent["text"]
            sid = sent["id"]
            prompt = f"<custom_token_3>{speaker}: {STYLE_TAG} {text}<|eot_id|><custom_token_4>"
            inputs = tokenizer(prompt, return_tensors="pt").to(device)
            n_text = inputs.input_ids.shape[1]

            torch.manual_seed(42)
            torch.cuda.manual_seed(42)
            t0 = time.time()
            try:
                with torch.no_grad():
                    out = model.generate(
                        **inputs, max_new_tokens=1500,
                        do_sample=True, temperature=0.6, top_p=0.9,
                        repetition_penalty=1.1,
                        pad_token_id=tokenizer.eos_token_id,
                    )
                latency_s = time.time() - t0
                new_toks = out[0][n_text:].tolist()
            except Exception as e:
                results.append({"id": sid, "lang": lang, "text": text,
                                 "valid": False, "has_eos_in_output": False,
                                 "audio_tokens": 0, "latency_s": 0,
                                 "duration_s": 0, "wer": None,
                                 "hypothesis": f"GEN_ERROR: {e}"})
                log(f"    [{sid}] GENERATION ERROR: {str(e)[:60]}")
                continue

            audio_tokens = [t for t in new_toks if AUDIO_TOKEN_BASE <= t < AUDIO_TOKEN_HI]
            has_eos = END_OF_SPEECH in new_toks
            audio_np, sr = tokens_to_audio(new_toks, snac_model)
            wer_score = None
            hyp = ""
            valid = False
            duration_s = 0

            if audio_np is not None and len(audio_np) > 0:
                duration_s = len(audio_np) / sr
                valid = True
                fname = f"{label}_{sid}.wav"
                fpath = os.path.join(audio_dir, fname)
                sf.write(fpath, audio_np, sr)
                try:
                    wl = "hi" if lang == "hindi" else "en"
                    asr = whisper_model.transcribe(fpath, language=wl)
                    hyp = asr["text"].strip()
                    wer_score = round(compute_wer(norm(text), norm(hyp)), 3)
                except Exception as e:
                    hyp = f"ASR_ERR: {e}"

            results.append({
                "id": sid, "lang": lang, "text": text,
                "valid": valid, "has_eos_in_output": has_eos,
                "audio_tokens": len(audio_tokens),
                "latency_s": round(latency_s, 2),
                "duration_s": round(duration_s, 2),
                "wer": wer_score, "hypothesis": hyp[:80],
            })
            log(f"    [{sid}] wer={wer_score} eos={has_eos} audio={len(audio_tokens)} "
                f"hyp='{hyp[:40]}'")

    hi_wers = [r["wer"] for r in results if r["lang"]=="hindi" and r["wer"] is not None]
    en_wers = [r["wer"] for r in results if r["lang"]=="english" and r["wer"] is not None]
    empty_count = sum(1 for r in results if not r["valid"] or r["audio_tokens"] < 7)
    eos_count = sum(1 for r in results if r["has_eos_in_output"])

    summary = {
        "label": label,
        "hindi_wer_avg": round(sum(hi_wers)/max(len(hi_wers),1), 3) if hi_wers else None,
        "english_wer_avg": round(sum(en_wers)/max(len(en_wers),1), 3) if en_wers else None,
        "empty_or_invalid": empty_count,
        "eos_in_output_count": eos_count,
        "total_sentences": len(results),
        "sentences": results,
    }
    return summary


def run_training(model, tokenizer, snac_model, ds, device, n_steps, lr, label,
                 oom_prevention=False):
    import torch
    from peft import LoraConfig, get_peft_model, TaskType
    from torch.optim import AdamW
    from transformers import get_cosine_schedule_with_warmup

    model.enable_input_require_grads()
    model.gradient_checkpointing_enable()
    lora_cfg = LoraConfig(
        task_type=TaskType.CAUSAL_LM, r=8, lora_alpha=16,
        target_modules=["q_proj", "v_proj"], lora_dropout=0.05, bias="none",
    )
    lora_model = get_peft_model(model, lora_cfg)
    trainable = sum(p.numel() for p in lora_model.parameters() if p.requires_grad)
    log(f"  LoRA attached — trainable={trainable:,}")

    # Pre-tokenize (BUGFIX: pass snac_model, NOT device, to audio_to_tokens)
    batches = []
    skipped = 0
    skip_reasons = {"audio_short": 0, "loss_short": 0, "error": 0}
    for i in range(min(n_steps * 3 + 100, len(ds))):
        if len(batches) >= n_steps: break
        try:
            s = ds[i]
            audio_np = s["audio"]["array"].astype("float32")
            sr_d = s["audio"]["sampling_rate"]
            text = s["text"]
            prompt = f"<custom_token_3>{SPEAKER_ID}: {STYLE_TAG} {text}<|eot_id|><custom_token_4>"
            text_ids = tokenizer.encode(prompt, add_special_tokens=False)
            # FIX: no 'device' argument — snac_model handles its own device
            audio_toks = audio_to_tokens(audio_np, sr_d, snac_model)
            if len(audio_toks) < 7:
                skipped += 1; skip_reasons["audio_short"] += 1; continue
            input_ids, labels = make_sequence_corrected(text_ids, audio_toks, MAX_SEQ_LEN)
            if (labels[0] != -100).sum().item() < 7:
                skipped += 1; skip_reasons["loss_short"] += 1; continue
            batches.append((input_ids.cpu(), labels.cpu()))
        except Exception as e:
            skipped += 1; skip_reasons["error"] += 1
            if skipped <= 3:
                log(f"  SKIP ERROR: {str(e)[:80]}")
            continue

    log(f"  Prepared {len(batches)} batches (skipped {skipped}: {skip_reasons})")

    if not batches:
        log("  CRITICAL: 0 batches prepared — cannot train")
        return lora_model, {
            "label": label, "lr": lr, "n_steps": n_steps,
            "steps_completed": 0, "loss_first": None, "loss_last": None,
            "loss_trend": "NOT_DECREASING", "nan_count": 0,
            "oom_occurred": False, "peak_vram_gb": 0,
            "train_time_s": 0, "trainable_params": trainable,
            "eos_in_format": True, "checkpoint": None,
            "skipped_batches": skipped, "error": "zero_batches",
        }

    # Verify sequence format on first batch
    inp0, lbl0 = batches[0]
    last_token = inp0[0][-1].item()
    loss_count = (lbl0[0] != -100).sum().item()
    log(f"  SEQUENCE CHECK: len={inp0.shape[1]} loss_tokens={loss_count} "
        f"last_token={last_token} is_eos={last_token==END_OF_SPEECH}")
    if last_token != END_OF_SPEECH:
        log(f"  WARNING: last token {last_token} != END_OF_SPEECH {END_OF_SPEECH}")

    total_opt_steps = max(1, len(batches) // GRAD_ACCUM)
    warmup_steps = max(1, int(total_opt_steps * 0.05))
    optimizer = AdamW(
        [p for p in lora_model.parameters() if p.requires_grad],
        lr=lr, weight_decay=0.01,
    )
    scheduler = get_cosine_schedule_with_warmup(
        optimizer, num_warmup_steps=warmup_steps,
        num_training_steps=total_opt_steps,
    )

    lora_model.train()
    losses = []
    peak_vram = 0
    nan_count = 0
    oom_occurred = False
    t_train = time.time()
    optimizer.zero_grad()

    for step, (inp, lbl) in enumerate(batches[:n_steps]):
        try:
            out = lora_model(input_ids=inp.to(device), labels=lbl.to(device))
            loss = out.loss / GRAD_ACCUM
            if torch.isnan(loss) or torch.isinf(loss):
                nan_count += 1
                optimizer.zero_grad()
                if nan_count > 5: break
                continue
            loss.backward()
            losses.append(out.loss.item())
            if (step + 1) % GRAD_ACCUM == 0:
                torch.nn.utils.clip_grad_norm_(
                    [p for p in lora_model.parameters() if p.requires_grad], 1.0)
                optimizer.step(); scheduler.step(); optimizer.zero_grad()
            if device == "cuda":
                peak_vram = max(peak_vram, torch.cuda.max_memory_allocated()/1e9)
            if oom_prevention and (step + 1) % 200 == 0:
                gc.collect(); torch.cuda.empty_cache()
            if (step + 1) % 25 == 0 or step == 0:
                avg = sum(losses[-10:])/min(len(losses), 10)
                log(f"  step {step+1}/{n_steps} loss={losses[-1]:.4f} avg={avg:.4f} vram={peak_vram:.2f}GB")
        except torch.cuda.OutOfMemoryError:
            oom_occurred = True
            log(f"  OOM at step {step+1}")
            optimizer.zero_grad(); gc.collect(); torch.cuda.empty_cache()
            break

    train_time = time.time() - t_train
    loss_trend = "DECREASING" if len(losses) > 1 and losses[-1] < losses[0] else "NOT_DECREASING"

    ckpt_path = f"{BASE_DIR}/{label}/checkpoint"
    os.makedirs(ckpt_path, exist_ok=True)
    lora_model.save_pretrained(ckpt_path)

    result = {
        "label": label, "lr": lr, "n_steps": n_steps,
        "steps_completed": len(losses),
        "loss_first": round(losses[0], 4) if losses else None,
        "loss_last": round(losses[-1], 4) if losses else None,
        "loss_trend": loss_trend,
        "nan_count": nan_count, "oom_occurred": oom_occurred,
        "peak_vram_gb": round(peak_vram, 2),
        "train_time_s": round(train_time, 1),
        "trainable_params": trainable,
        "eos_in_format": True, "checkpoint": ckpt_path,
        "skipped_batches": skipped,
    }
    log(f"  Training done — {len(losses)} steps, loss {result['loss_first']} → {result['loss_last']} ({loss_trend})")
    return lora_model, result


def gate_check(eval_result, train_result, name, hindi_wer_max, english_wer_max,
               oom_required_absent=False):
    hi_wer = eval_result.get("hindi_wer_avg")
    en_wer = eval_result.get("english_wer_avg")
    empty = eval_result.get("empty_or_invalid", 999)
    eos_out = eval_result.get("eos_in_output_count", 0)
    oom = train_result.get("oom_occurred", False)
    steps = train_result.get("steps_completed", 0)

    checks = {
        "training_completed": {"pass": steps > 0, "value": steps},
        "hindi_wer": {"pass": hi_wer is not None and hi_wer < hindi_wer_max,
                      "value": hi_wer, "threshold": hindi_wer_max},
        "english_wer": {"pass": en_wer is not None and en_wer < english_wer_max,
                        "value": en_wer, "threshold": english_wer_max},
        "generation_valid": {"pass": empty <= 10, "value": empty},
        "eos_in_output": {"pass": eos_out > 0, "value": eos_out},
    }
    if oom_required_absent:
        checks["no_oom"] = {"pass": not oom, "value": oom}

    all_pass = all(c["pass"] for c in checks.values())
    critical = (checks["training_completed"]["pass"] and
                checks["hindi_wer"]["pass"] and
                checks["english_wer"]["pass"])
    status = "PASS" if all_pass else "PARTIAL" if critical else "FAIL"

    log(f"  GATE {name}: {status}")
    for k, v in checks.items():
        icon = "✅" if v["pass"] else "❌"
        log(f"    {icon} {k}: {v.get('value','?')} (threshold={v.get('threshold','N/A')})")
    return status, checks


@app.function(
    gpu="L4",
    image=image,
    volumes={"/rnd": rnd_volume},
    timeout=7200,
)
def run_gated_experiments():
    import torch
    import whisper
    from transformers import AutoTokenizer, AutoModelForCausalLM
    from snac import SNAC
    from datasets import load_dataset

    for exp in ["F1", "F2", "F3"]:
        os.makedirs(f"{BASE_DIR}/{exp}/audio", exist_ok=True)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    t_start = time.time()
    report = {
        "phase": "7.2.F", "version": "v2_bugfix",
        "gpu": torch.cuda.get_device_name(0) if device=="cuda" else "CPU",
        "bugs_fixed": [
            "SNAC device mismatch: audio now encoded on snac_model device (CPU)",
            "gradient_checkpointing: model.eval() + use_cache=True before evaluation",
        ],
        "baselines": {
            "base_hindi_wer": BASELINE_HINDI_WER_BASE,
            "base_english_wer": BASELINE_ENGLISH_WER_BASE,
        },
        "experiments": {},
    }

    log("=" * 60)
    log("PHASE 7.2.F v2 — BUGFIX + GATED EXPERIMENTS")
    log(f"GPU: {report['gpu']} | EOS: {END_OF_SPEECH}")
    log("BUGS FIXED: SNAC device mismatch + KV cache on eval")
    log("=" * 60)

    # Shared resources
    tokenizer = AutoTokenizer.from_pretrained("kenpath/svara-tts-v1")
    snac = SNAC.from_pretrained("hubertsiuzdak/snac_24khz").eval().to("cpu")  # CPU intentional
    whisper_model = whisper.load_model("base")
    ds = load_dataset("SPRINGLab/IndicTTS-Hindi", split="train")
    eos_in_vocab = END_OF_SPEECH < len(tokenizer)
    eos_str = tokenizer.convert_ids_to_tokens(END_OF_SPEECH)
    log(f"  EOS (128258) in vocab: {eos_in_vocab} | string: {eos_str}")
    log(f"  Dataset: {len(ds)} samples | SNAC: CPU | Training GPU: {device}")

    # BASE evaluation
    log("\n=== BASE MODEL EVALUATION ===")
    base_model = AutoModelForCausalLM.from_pretrained(
        "kenpath/svara-tts-v1", torch_dtype=torch.bfloat16, device_map="cuda:0"
    )
    base_eval = evaluate_model(base_model, tokenizer, snac, whisper_model, device,
                               "base", f"{BASE_DIR}/F1/audio")
    del base_model; gc.collect(); torch.cuda.empty_cache()
    report["base_evaluation"] = base_eval
    log(f"  Base: hi_wer={base_eval['hindi_wer_avg']} en_wer={base_eval['english_wer_avg']} "
        f"eos={base_eval['eos_in_output_count']}/30")

    # ── F1: EOS fix only ──────────────────────────────────────────────────────
    log("\n" + "="*60)
    log("F1: EOS FIX ONLY | LR=2e-4 | Steps=100")
    log("="*60)
    base_f1 = AutoModelForCausalLM.from_pretrained(
        "kenpath/svara-tts-v1", torch_dtype=torch.bfloat16, device_map="cuda:0"
    )
    f1_model, f1_train = run_training(
        base_f1, tokenizer, snac, ds, device,
        n_steps=100, lr=2e-4, label="F1", oom_prevention=False,
    )
    f1_eval = evaluate_model(f1_model, tokenizer, snac, whisper_model, device,
                             "F1", f"{BASE_DIR}/F1/audio")
    del f1_model, base_f1; gc.collect(); torch.cuda.empty_cache()

    f1_status, f1_checks = gate_check(f1_eval, f1_train, "F1",
                                       GATE_F1_HINDI_WER_MAX, GATE_F1_ENGLISH_WER_MAX)
    report["experiments"]["F1"] = {
        "config": {"eos_fix": True, "lr": 2e-4, "steps": 100},
        "training": f1_train, "evaluation": f1_eval,
        "gate_status": f1_status, "gate_checks": f1_checks,
    }
    log(f"F1 GATE: {f1_status} | hi_wer={f1_eval['hindi_wer_avg']} en_wer={f1_eval['english_wer_avg']}")

    if f1_status == "FAIL":
        report["pipeline_stopped_at"] = "F1"
        return finalize(report, t_start)

    # ── F2: EOS + LR 5e-5 ────────────────────────────────────────────────────
    log("\n" + "="*60)
    log("F2: EOS + LR=5e-5 | Steps=100")
    log("="*60)
    base_f2 = AutoModelForCausalLM.from_pretrained(
        "kenpath/svara-tts-v1", torch_dtype=torch.bfloat16, device_map="cuda:0"
    )
    f2_model, f2_train = run_training(
        base_f2, tokenizer, snac, ds, device,
        n_steps=100, lr=5e-5, label="F2", oom_prevention=False,
    )
    f2_eval = evaluate_model(f2_model, tokenizer, snac, whisper_model, device,
                             "F2", f"{BASE_DIR}/F2/audio")
    del f2_model, base_f2; gc.collect(); torch.cuda.empty_cache()

    f2_status, f2_checks = gate_check(f2_eval, f2_train, "F2",
                                       GATE_F1_HINDI_WER_MAX, GATE_F2_ENGLISH_WER_MAX)
    report["experiments"]["F2"] = {
        "config": {"eos_fix": True, "lr": 5e-5, "steps": 100},
        "training": f2_train, "evaluation": f2_eval,
        "gate_status": f2_status, "gate_checks": f2_checks,
    }
    log(f"F2 GATE: {f2_status} | hi_wer={f2_eval['hindi_wer_avg']} en_wer={f2_eval['english_wer_avg']}")

    if f2_status == "FAIL":
        report["pipeline_stopped_at"] = "F2"
        return finalize(report, t_start)

    # ── F3: EOS + LR 5e-5 + OOM prevention ───────────────────────────────────
    log("\n" + "="*60)
    log("F3: EOS + LR=5e-5 + OOM prevention | Steps=500")
    log("="*60)
    base_f3 = AutoModelForCausalLM.from_pretrained(
        "kenpath/svara-tts-v1", torch_dtype=torch.bfloat16, device_map="cuda:0"
    )
    f3_model, f3_train = run_training(
        base_f3, tokenizer, snac, ds, device,
        n_steps=500, lr=5e-5, label="F3", oom_prevention=True,
    )
    f3_eval = evaluate_model(f3_model, tokenizer, snac, whisper_model, device,
                             "F3", f"{BASE_DIR}/F3/audio")
    del f3_model, base_f3; gc.collect(); torch.cuda.empty_cache()

    f3_status, f3_checks = gate_check(
        f3_eval, f3_train, "F3",
        GATE_F1_HINDI_WER_MAX, GATE_F2_ENGLISH_WER_MAX,
        oom_required_absent=True,
    )
    report["experiments"]["F3"] = {
        "config": {"eos_fix": True, "lr": 5e-5, "steps": 500, "oom_prevention": True},
        "training": f3_train, "evaluation": f3_eval,
        "gate_status": f3_status, "gate_checks": f3_checks,
    }
    log(f"F3 GATE: {f3_status} | hi_wer={f3_eval['hindi_wer_avg']} en_wer={f3_eval['english_wer_avg']}")

    return finalize(report, t_start)


def finalize(report, t_start):
    total = time.time() - t_start
    report["total_time_s"] = round(total, 1)
    report["cost_usd"] = round(total/3600*0.80, 3)

    passed = [k for k,v in report["experiments"].items() if v["gate_status"] in ("PASS","PARTIAL")]
    failed = [k for k,v in report["experiments"].items() if v["gate_status"]=="FAIL"]

    log("\n" + "="*60)
    log("COMPARISON MATRIX")
    log("="*60)
    base_ev = report.get("base_evaluation", {})
    rows = [
        {"experiment": "BASE",        "hindi_wer": base_ev.get("hindi_wer_avg"), "english_wer": base_ev.get("english_wer_avg"), "gate": "—"},
        {"experiment": "7.2.C",       "hindi_wer": 1.497, "english_wer": 0.562, "gate": "FAIL"},
    ]
    for exp_name in ["F1","F2","F3"]:
        exp = report["experiments"].get(exp_name)
        if exp:
            rows.append({
                "experiment": exp_name,
                "hindi_wer": exp["evaluation"].get("hindi_wer_avg"),
                "english_wer": exp["evaluation"].get("english_wer_avg"),
                "gate": exp["gate_status"],
            })

    for r in rows:
        log(f"  {r['experiment']:<10} hi_wer={r['hindi_wer']} en_wer={r['english_wer']} gate={r['gate']}")

    if "F3" in passed:
        rec = "ALL GATES PASSED. Recipe validated. Approve full 3-epoch training."
    elif "F2" in passed:
        rec = "F1+F2 passed. F3 needs OOM investigation before full training."
    elif "F1" in passed:
        rec = "F1 passed. F2 failed. LR strategy needs review."
    else:
        rec = "F1 failed even with bug fixes. Deeper investigation needed."

    report["comparison_matrix"] = rows
    report["gates_passed"] = passed
    report["gates_failed"] = failed
    report["recommendation"] = rec

    with open(f"{BASE_DIR}/phase72f_v2_report.json", "w") as f:
        json.dump(report, f, indent=2, ensure_ascii=False, default=str)

    log(f"RECOMMENDATION: {rec}")
    log(f"Cost: ${report['cost_usd']} | Time: {total/60:.1f}min")
    log("STOP — awaiting approval")
    return {
        "phase": "7.2.F_v2", "version": "bugfix",
        "gates_passed": passed, "gates_failed": failed,
        "comparison_matrix": rows,
        "recommendation": rec,
        "total_time_s": report["total_time_s"],
        "cost_usd": report["cost_usd"],
    }


@app.local_entrypoint()
def main():
    log("Phase 7.2.F v2 (bugfix) starting...")
    log("BUGS FIXED: SNAC device + KV cache on eval")
    report = run_gated_experiments.remote()
    print(json.dumps(report, indent=2, ensure_ascii=False, default=str))
    with open("phase72f_v2_report.json", "w") as f:
        json.dump(report, f, indent=2, ensure_ascii=False, default=str)
      
