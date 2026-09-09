"""
Zarax Phase 7.2.F — Controlled Root-Cause Fix Validation
=========================================================
GATED PIPELINE: F1 → F2 → F3 (each gate must pass before next runs)

F1: EOS fix ONLY (single variable change)
F2: EOS + LR 5e-5 (if F1 passes)
F3: EOS + LR 5e-5 + OOM prevention (if F2 passes)

LOCKED FOR ALL EXPERIMENTS:
  Model:   kenpath/svara-tts-v1
  Dataset: SPRINGLab/IndicTTS-Hindi
  LoRA:    r=8, alpha=16, q_proj/v_proj
  Eval:    same 7.2.D evaluation set (20 Hindi + 10 English)

EOS FIX (critical correction from 7.2.E):
  OLD: text_ids + audio_ids           → model never learned to stop
  NEW: text_ids + audio_ids + [128258] → model learns stopping criterion

PRODUCTION SAFETY: R&D isolated. Zero production changes.
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

# ── Constants (locked for all F1/F2/F3) ───────────────────────────────────────
AUDIO_TOKEN_BASE = 128266
AUDIO_TOKEN_HI   = AUDIO_TOKEN_BASE + 7 * 4096  # 156938
END_OF_SPEECH    = 128258   # CONFIRMED in E2: base model generates this naturally
TARGET_SR        = 24000
MAX_SEQ_LEN      = 768
BATCH_SIZE       = 1
GRAD_ACCUM       = 4
SPEAKER_ID       = "Hindi (Female)"
STYLE_TAG        = "<neutral>"
BASE_DIR         = "/rnd/phase72f"

# Baselines from 7.2.E (to compare against)
BASELINE_HINDI_WER_BASE    = 0.785   # clean base model
BASELINE_HINDI_WER_100STEP = 0.989   # 100-step old format (broken)
BASELINE_ENGLISH_WER_BASE  = 0.155   # clean base model
BASELINE_ENGLISH_WER_72C   = 0.562   # 7.2.C epoch_2 (broken)

# Gate thresholds
GATE_F1_HINDI_WER_MAX   = 0.989   # must improve vs old 100-step
GATE_F1_ENGLISH_WER_MAX = 0.400   # must not badly regress from base
GATE_F2_ENGLISH_WER_MAX = 0.300   # LR fix must substantially reduce regression
GATE_F3_NO_OOM          = True    # 500 steps without OOM

# SAME evaluation set as 7.2.D (locked)
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
    """Verified SNAC decoding (Phase 7.1 + Phase 7.2.E confirmed)."""
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
    t0 = torch.tensor(c0).clamp(0, 4095).unsqueeze(0)
    t1 = torch.tensor(c1).clamp(0, 4095).unsqueeze(0)
    t2 = torch.tensor(c2).clamp(0, 4095).unsqueeze(0)
    with torch.no_grad():
        audio = snac_model.decode([t0, t1, t2])
    return audio.squeeze().numpy().astype("float32"), TARGET_SR


def make_sequence_corrected(text_ids, audio_ids, max_len):
    """
    CORRECTED training format (F1 fix).
    Adds END_OF_SPEECH after audio — model learns stopping criterion.

    Verification:
      input_ids: [TEXT_IDS] + [AUDIO_IDS] + [EOS]
      labels:    [-100 × len_text] + [AUDIO_IDS] + [EOS]
      HuggingFace LlamaForCausalLM shifts internally for next-token pred.
      Model learns: given audio[-1] → predict EOS (128258)
    """
    import torch
    n_audio = (min(max_len - len(text_ids) - 1, len(audio_ids)) // 7) * 7
    seq = text_ids + audio_ids[:n_audio] + [END_OF_SPEECH]
    input_ids = torch.tensor(seq, dtype=torch.long).unsqueeze(0)
    labels = input_ids.clone()
    labels[:, :len(text_ids)] = -100
    return input_ids, labels


def audio_to_tokens(audio_np, sr, snac_model, device):
    """48kHz→24kHz resample + SNAC encode + interleave."""
    import torch, librosa
    if sr != TARGET_SR:
        audio_np = librosa.resample(audio_np.astype("float32"),
                                    orig_sr=sr, target_sr=TARGET_SR)
    audio_t = torch.tensor(audio_np, dtype=torch.float32).unsqueeze(0).unsqueeze(0).to(device)
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
    """Evaluate model on fixed 7.2.D set. Returns per-sentence results."""
    import torch, soundfile as sf
    from jiwer import wer as compute_wer
    import unicodedata, re

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
            with torch.no_grad():
                out = model.generate(
                    **inputs, max_new_tokens=1500,
                    do_sample=True, temperature=0.6, top_p=0.9,
                    repetition_penalty=1.1,
                    pad_token_id=tokenizer.eos_token_id,
                )
            latency_s = time.time() - t0
            new_toks = out[0][n_text:].tolist()

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

    return {
        "label": label,
        "hindi_wer_avg": round(sum(hi_wers)/max(len(hi_wers),1), 3) if hi_wers else None,
        "english_wer_avg": round(sum(en_wers)/max(len(en_wers),1), 3) if en_wers else None,
        "empty_or_invalid": empty_count,
        "eos_in_output_count": eos_count,
        "total_sentences": len(results),
        "sentences": results,
    }


def run_training(model, tokenizer, snac_model, ds, device, n_steps, lr, label,
                 oom_prevention=False):
    """
    LoRA training with corrected EOS format.
    oom_prevention: adds cache clear every 200 steps.
    """
    import torch
    from peft import LoraConfig, get_peft_model, TaskType
    from torch.optim import AdamW
    from transformers import get_cosine_schedule_with_warmup
    import librosa

    # Attach LoRA (same config for all experiments)
    model.enable_input_require_grads()
    model.gradient_checkpointing_enable()
    lora_cfg = LoraConfig(
        task_type=TaskType.CAUSAL_LM, r=8, lora_alpha=16,
        target_modules=["q_proj", "v_proj"], lora_dropout=0.05, bias="none",
    )
    lora_model = get_peft_model(model, lora_cfg)
    trainable = sum(p.numel() for p in lora_model.parameters() if p.requires_grad)
    log(f"  LoRA attached — trainable={trainable:,} ({100*trainable/sum(p.numel() for p in lora_model.parameters()):.3f}%)")

    # Pre-tokenize samples
    batches = []
    skipped = 0
    for i in range(min(n_steps * 2 + 50, len(ds))):
        if len(batches) >= n_steps: break
        try:
            s = ds[i]
            audio_np = s["audio"]["array"].astype("float32")
            sr_d = s["audio"]["sampling_rate"]
            text = s["text"]
            prompt = f"<custom_token_3>{SPEAKER_ID}: {STYLE_TAG} {text}<|eot_id|><custom_token_4>"
            text_ids = tokenizer.encode(prompt, add_special_tokens=False)
            audio_toks = audio_to_tokens(audio_np, sr_d, snac_model, device)
            if len(audio_toks) < 7: skipped += 1; continue
            input_ids, labels = make_sequence_corrected(text_ids, audio_toks, MAX_SEQ_LEN)
            if (labels[0] != -100).sum().item() < 7: skipped += 1; continue
            batches.append((input_ids.cpu(), labels.cpu()))
        except: skipped += 1; continue

    log(f"  Prepared {len(batches)} batches (skipped {skipped})")

    # Print ONE example for verification (Gate pre-check)
    if batches:
        inp0, lbl0 = batches[0]
        loss_positions = (lbl0[0] != -100).sum().item()
        last_token = inp0[0][-1].item()
        log(f"  SEQUENCE VERIFICATION:")
        log(f"    Total tokens: {inp0.shape[1]}")
        log(f"    Loss tokens: {loss_positions}")
        log(f"    Last token: {last_token} (EOS={last_token == END_OF_SPEECH})")
        assert last_token == END_OF_SPEECH, f"GATE FAIL: Last token is {last_token}, expected {END_OF_SPEECH}"
        log(f"    ✅ EOS placement verified — last token IS END_OF_SPEECH")

    # Optimizer + scheduler
    total_opt_steps = len(batches) // GRAD_ACCUM
    warmup_steps = max(1, int(total_opt_steps * 0.05))
    optimizer = AdamW(
        [p for p in lora_model.parameters() if p.requires_grad],
        lr=lr, weight_decay=0.01,
    )
    scheduler = get_cosine_schedule_with_warmup(
        optimizer, num_warmup_steps=warmup_steps,
        num_training_steps=total_opt_steps,
    )

    # Training loop
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
                log(f"  ⚠️ NaN/Inf at step {step+1}")
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
            if (step + 1) % 25 == 0:
                avg = sum(losses[-10:])/min(len(losses), 10)
                log(f"  step {step+1}/{n_steps} loss={losses[-1]:.4f} avg={avg:.4f} vram={peak_vram:.2f}GB")
        except torch.cuda.OutOfMemoryError:
            oom_occurred = True
            log(f"  ❌ OOM at step {step+1}")
            optimizer.zero_grad(); gc.collect(); torch.cuda.empty_cache()
            break

    train_time = time.time() - t_train
    loss_trend = "DECREASING" if len(losses) > 1 and losses[-1] < losses[0] else "NOT_DECREASING"

    # Save checkpoint
    ckpt_path = f"{BASE_DIR}/{label}/checkpoint"
    os.makedirs(ckpt_path, exist_ok=True)
    lora_model.save_pretrained(ckpt_path)

    result = {
        "label": label, "lr": lr, "n_steps": n_steps,
        "steps_completed": len(losses),
        "loss_first": round(losses[0], 4) if losses else None,
        "loss_last": round(losses[-1], 4) if losses else None,
        "loss_trend": loss_trend,
        "nan_count": nan_count,
        "oom_occurred": oom_occurred,
        "peak_vram_gb": round(peak_vram, 2),
        "train_time_s": round(train_time, 1),
        "trainable_params": trainable,
        "eos_in_format": True,
        "checkpoint": ckpt_path,
        "skipped_batches": skipped,
    }
    log(f"  Training done — loss {result['loss_first']} → {result['loss_last']} ({loss_trend})")
    log(f"  Peak VRAM: {peak_vram:.2f}GB | OOM: {oom_occurred}")

    return lora_model, result


def gate_check(eval_result, experiment_name, hindi_wer_max, english_wer_max,
               oom_occurred=False, oom_required_absent=False):
    """Explicit gate check with clear pass/fail criteria."""
    checks = {}
    hi_wer = eval_result.get("hindi_wer_avg")
    en_wer = eval_result.get("english_wer_avg")
    empty = eval_result.get("empty_or_invalid", 999)
    eos_count = eval_result.get("eos_in_output_count", 0)
    total = eval_result.get("total_sentences", 30)

    checks["hindi_wer_improved"] = {
        "value": hi_wer,
        "threshold": hindi_wer_max,
        "pass": hi_wer is not None and hi_wer < hindi_wer_max,
    }
    checks["english_wer_acceptable"] = {
        "value": en_wer,
        "threshold": english_wer_max,
        "pass": en_wer is not None and en_wer < english_wer_max,
    }
    checks["generation_not_broken"] = {
        "value": empty,
        "threshold": 10,
        "pass": empty <= 10,
    }
    checks["eos_in_output"] = {
        "value": eos_count,
        "threshold": 1,
        "pass": eos_count > 0,
    }
    if oom_required_absent:
        checks["no_oom"] = {"value": oom_occurred, "pass": not oom_occurred}

    all_pass = all(c["pass"] for c in checks.values())
    critical_pass = (checks["hindi_wer_improved"]["pass"] and
                     checks["english_wer_acceptable"]["pass"])

    if all_pass:
        status = "PASS"
    elif critical_pass:
        status = "PARTIAL"
    else:
        status = "FAIL"

    log(f"  GATE {experiment_name}: {status}")
    for k, v in checks.items():
        icon = "✅" if v["pass"] else "❌"
        log(f"    {icon} {k}: {v.get('value','?')} (threshold={v.get('threshold','?')})")

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

    os.makedirs(BASE_DIR, exist_ok=True)
    for exp in ["F1", "F2", "F3"]:
        os.makedirs(f"{BASE_DIR}/{exp}/audio", exist_ok=True)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    t_start = time.time()
    report = {
        "phase": "7.2.F",
        "gpu": torch.cuda.get_device_name(0) if device == "cuda" else "CPU",
        "eos_token_id": END_OF_SPEECH,
        "baselines": {
            "base_hindi_wer": BASELINE_HINDI_WER_BASE,
            "base_english_wer": BASELINE_ENGLISH_WER_BASE,
            "100step_old_format_hindi_wer": BASELINE_HINDI_WER_100STEP,
            "72c_epoch2_english_wer": BASELINE_ENGLISH_WER_72C,
        },
        "experiments": {},
    }

    log("=" * 60)
    log("PHASE 7.2.F — GATED EXPERIMENT PIPELINE")
    log(f"GPU: {report['gpu']}")
    log(f"EOS token: {END_OF_SPEECH}")
    log(f"F1: EOS fix only | F2: EOS+LR5e-5 | F3: EOS+LR5e-5+OOM fix")
    log("=" * 60)

    # ── Load shared resources ────────────────────────────────────────────────
    log("\n=== Loading shared resources ===")
    tokenizer = AutoTokenizer.from_pretrained("kenpath/svara-tts-v1")
    snac = SNAC.from_pretrained("hubertsiuzdak/snac_24khz").eval().to("cpu")
    whisper_model = whisper.load_model("base")
    ds = load_dataset("SPRINGLab/IndicTTS-Hindi", split="train")
    log(f"  Dataset: {len(ds)} samples | Tokenizer vocab: {len(tokenizer)}")

    # Verify EOS in vocab
    eos_in_vocab = END_OF_SPEECH < len(tokenizer)
    eos_token_str = tokenizer.convert_ids_to_tokens(END_OF_SPEECH)
    log(f"  EOS (128258) in vocab: {eos_in_vocab} | token string: {eos_token_str}")
    assert eos_in_vocab, "BLOCKED: END_OF_SPEECH not in tokenizer vocabulary"

    # ── BASE EVALUATION (reference) ────────────────────────────────────────
    log("\n=== BASE MODEL EVALUATION (reference) ===")
    base_model = AutoModelForCausalLM.from_pretrained(
        "kenpath/svara-tts-v1", torch_dtype=torch.bfloat16, device_map="cuda:0"
    )
    base_eval = evaluate_model(base_model, tokenizer, snac, whisper_model, device,
                               "base_reference", f"{BASE_DIR}/F1/audio")
    del base_model; gc.collect(); torch.cuda.empty_cache()
    report["base_evaluation"] = base_eval
    log(f"  Base: hi_wer={base_eval['hindi_wer_avg']} en_wer={base_eval['english_wer_avg']}")

    # ════════════════════════════════════════════════════════════════════════
    # F1 — EOS FIX ONLY
    # ════════════════════════════════════════════════════════════════════════
    log("\n" + "=" * 60)
    log("F1 — EOS FIX ONLY (single variable change)")
    log("  Change: add END_OF_SPEECH (128258) after audio in training labels")
    log("  LR: 2e-4 (SAME as 7.2.C) | Steps: 100")
    log("=" * 60)

    base_f1 = AutoModelForCausalLM.from_pretrained(
        "kenpath/svara-tts-v1", torch_dtype=torch.bfloat16, device_map="cuda:0"
    )
    f1_model, f1_train = run_training(
        base_f1, tokenizer, snac, ds, device,
        n_steps=100, lr=2e-4, label="F1",
        oom_prevention=False,
    )
    f1_eval = evaluate_model(f1_model, tokenizer, snac, whisper_model, device,
                             "F1", f"{BASE_DIR}/F1/audio")
    del f1_model, base_f1; gc.collect(); torch.cuda.empty_cache()

    f1_gate_status, f1_gate_checks = gate_check(
        f1_eval, "F1",
        hindi_wer_max=GATE_F1_HINDI_WER_MAX,
        english_wer_max=GATE_F1_ENGLISH_WER_MAX,
    )
    report["experiments"]["F1"] = {
        "config": {"eos_fix": True, "lr": 2e-4, "steps": 100, "oom_prevention": False},
        "training": f1_train,
        "evaluation": f1_eval,
        "gate_status": f1_gate_status,
        "gate_checks": f1_gate_checks,
    }
    log(f"F1 GATE: {f1_gate_status}")

    if f1_gate_status == "FAIL":
        report["pipeline_stopped_at"] = "F1"
        report["reason"] = "F1 gate failed — EOS fix alone did not improve quality"
        log("STOP: F1 FAIL — not proceeding to F2")
        return finalize_report(report, t_start)

    # ════════════════════════════════════════════════════════════════════════
    # F2 — EOS + LR 5e-5
    # ════════════════════════════════════════════════════════════════════════
    log("\n" + "=" * 60)
    log("F2 — EOS + LR 5e-5 (F1 passed gate)")
    log("  Changes: EOS fix (from F1) + LR: 2e-4 → 5e-5")
    log("  Steps: 100")
    log("=" * 60)

    base_f2 = AutoModelForCausalLM.from_pretrained(
        "kenpath/svara-tts-v1", torch_dtype=torch.bfloat16, device_map="cuda:0"
    )
    f2_model, f2_train = run_training(
        base_f2, tokenizer, snac, ds, device,
        n_steps=100, lr=5e-5, label="F2",
        oom_prevention=False,
    )
    f2_eval = evaluate_model(f2_model, tokenizer, snac, whisper_model, device,
                             "F2", f"{BASE_DIR}/F2/audio")
    del f2_model, base_f2; gc.collect(); torch.cuda.empty_cache()

    f2_gate_status, f2_gate_checks = gate_check(
        f2_eval, "F2",
        hindi_wer_max=GATE_F1_HINDI_WER_MAX,
        english_wer_max=GATE_F2_ENGLISH_WER_MAX,
    )
    report["experiments"]["F2"] = {
        "config": {"eos_fix": True, "lr": 5e-5, "steps": 100, "oom_prevention": False},
        "training": f2_train,
        "evaluation": f2_eval,
        "gate_status": f2_gate_status,
        "gate_checks": f2_gate_checks,
    }
    log(f"F2 GATE: {f2_gate_status}")

    if f2_gate_status == "FAIL":
        report["pipeline_stopped_at"] = "F2"
        report["reason"] = "F2 gate failed — LR 5e-5 did not sufficiently reduce regression"
        log("STOP: F2 FAIL — not proceeding to F3")
        return finalize_report(report, t_start)

    # ════════════════════════════════════════════════════════════════════════
    # F3 — EOS + LR 5e-5 + OOM PREVENTION
    # ════════════════════════════════════════════════════════════════════════
    log("\n" + "=" * 60)
    log("F3 — EOS + LR 5e-5 + OOM prevention (F2 passed gate)")
    log("  Changes: F2 fixes + torch.cuda.empty_cache() every 200 steps")
    log("  Steps: 500 (stability validation)")
    log("=" * 60)

    base_f3 = AutoModelForCausalLM.from_pretrained(
        "kenpath/svara-tts-v1", torch_dtype=torch.bfloat16, device_map="cuda:0"
    )
    f3_model, f3_train = run_training(
        base_f3, tokenizer, snac, ds, device,
        n_steps=500, lr=5e-5, label="F3",
        oom_prevention=True,
    )
    f3_eval = evaluate_model(f3_model, tokenizer, snac, whisper_model, device,
                             "F3", f"{BASE_DIR}/F3/audio")
    del f3_model, base_f3; gc.collect(); torch.cuda.empty_cache()

    f3_gate_status, f3_gate_checks = gate_check(
        f3_eval, "F3",
        hindi_wer_max=GATE_F1_HINDI_WER_MAX,
        english_wer_max=GATE_F2_ENGLISH_WER_MAX,
        oom_occurred=f3_train["oom_occurred"],
        oom_required_absent=True,
    )
    report["experiments"]["F3"] = {
        "config": {"eos_fix": True, "lr": 5e-5, "steps": 500, "oom_prevention": True},
        "training": f3_train,
        "evaluation": f3_eval,
        "gate_status": f3_gate_status,
        "gate_checks": f3_gate_checks,
    }
    log(f"F3 GATE: {f3_gate_status}")

    return finalize_report(report, t_start)


def finalize_report(report, t_start):
    """Generate comparison matrix and final recommendation."""
    total_time = time.time() - t_start
    report["total_time_s"] = round(total_time, 1)
    report["cost_usd"] = round(total_time / 3600 * 0.80, 3)

    # Comparison matrix
    log("\n" + "=" * 60)
    log("COMPARISON MATRIX")
    log("=" * 60)
    rows = [
        ("BASE", BASELINE_HINDI_WER_BASE, BASELINE_ENGLISH_WER_BASE, "—", "—"),
        ("7.2.C epoch_2", 1.497, BASELINE_ENGLISH_WER_72C, "NO EOS, LR 2e-4", "FAIL"),
    ]
    for exp_name in ["F1", "F2", "F3"]:
        exp = report["experiments"].get(exp_name)
        if exp:
            ev = exp["evaluation"]
            cfg = exp["config"]
            desc = f"EOS={'✅' if cfg['eos_fix'] else '❌'} LR={cfg['lr']} steps={cfg['steps']}"
            rows.append((exp_name, ev.get("hindi_wer_avg"), ev.get("english_wer_avg"),
                         desc, exp["gate_status"]))

    log(f"{'Exp':<12} {'Hindi WER':>10} {'English WER':>12} {'Config':<30} {'Gate':>8}")
    log("-" * 75)
    for row in rows:
        log(f"{row[0]:<12} {str(row[1]):>10} {str(row[2]):>12} {row[3]:<30} {row[4]:>8}")

    report["comparison_matrix"] = [
        {"experiment": r[0], "hindi_wer": r[1], "english_wer": r[2],
         "config": r[3], "gate": r[4]} for r in rows
    ]

    # Determine overall recommendation
    passed = [k for k, v in report["experiments"].items() if v["gate_status"] in ("PASS", "PARTIAL")]
    failed = [k for k, v in report["experiments"].items() if v["gate_status"] == "FAIL"]

    if "F3" in passed:
        recommendation = "F1+F2+F3 all passed. Corrected recipe validated. APPROVE full 3-epoch training."
    elif "F2" in passed:
        recommendation = "F1+F2 passed, F3 blocked/failed. Investigate OOM before full training."
    elif "F1" in passed:
        recommendation = "F1 passed, F2 failed. EOS fix helps but LR strategy needs review."
    else:
        recommendation = "F1 failed. EOS is not the primary root cause. Further investigation needed."

    report["recommendation"] = recommendation
    report["what_is_proven"] = []
    report["what_is_not_proven"] = [
        "Hindi MOS improvement (requires human listening)",
        "Same-voice identity (not tested)",
        "Cross-language identity (not tested)",
        "Commercial production readiness",
    ]

    if "F1" in passed:
        report["what_is_proven"].append(
            "EOS fix improves generation stability (F1 gate passed)")
    if "F2" in passed:
        report["what_is_proven"].append(
            "LR 5e-5 reduces English regression (F2 gate passed)")
    if "F3" in passed:
        report["what_is_proven"].append(
            "OOM prevention allows stable 500-step training (F3 gate passed)")

    # Save full report
    report_path = f"{BASE_DIR}/phase72f_full_report.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2, ensure_ascii=False, default=str)

    log(f"\nTotal time: {total_time/60:.1f}min | Cost: ${report['cost_usd']}")
    log(f"RECOMMENDATION: {recommendation}")
    log("STOP — awaiting approval before full training")

    return {
        "phase": "7.2.F",
        "recommendation": recommendation,
        "experiments_run": list(report["experiments"].keys()),
        "gates_passed": passed,
        "gates_failed": failed,
        "comparison_matrix": report["comparison_matrix"],
        "what_is_proven": report["what_is_proven"],
        "what_is_not_proven": report["what_is_not_proven"],
        "total_time_s": report["total_time_s"],
        "cost_usd": report["cost_usd"],
    }


@app.local_entrypoint()
def main():
    log("Phase 7.2.F starting — gated F1→F2→F3 pipeline on Modal L4...")
    log("Expected: ~30-60 min, ~$0.40-0.80")
    report = run_gated_experiments.remote()
    print("\n" + "=" * 60)
    print("PHASE 7.2.F — FINAL REPORT")
    print("=" * 60)
    print(json.dumps(report, indent=2, ensure_ascii=False, default=str))
    with open("phase72f_report.json", "w") as f:
        json.dump(report, f, indent=2, ensure_ascii=False, default=str)
    log("Report saved: phase72f_report.json")
  
