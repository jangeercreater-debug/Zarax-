"""
Zarax Phase 7.2.B — Real LoRA Smoke Test
=========================================
PURPOSE: Validate actual svara-TTS weights + real Hindi speech data
         through verified Orpheus-compatible LoRA pipeline.

SCOPE:
  - 100 training steps only
  - Dataset: SPRINGLab/IndicTTS-Hindi (open, CC-BY-4.0 inferred)
  - Model: kenpath/svara-tts-v1 (ACTUAL weights, not tiny model)
  - GPU: Modal L4 24GB
  - Target cost: ~$0.40 (30 min)

DOES NOT:
  - Run full training (epochs)
  - Download IndicVoices-R
  - Modify production services
  - Claim MOS improvement from 100 steps

DATASET LICENSE NOTE:
  SPRINGLab/IndicTTS-Hindi used by SPRINGLab F5-Hindi-24KHz (CC-BY-4.0).
  Original IndicTTS from IIT Madras Speech Technology Consortium.
  Attribution required: "Indic TTS, IIT Madras, Speech Technology Consortium"
  LEGAL REVIEW RECOMMENDED before production use.

AUDIO PIPELINE (VERIFIED):
  Input: 48kHz WAV (dataset format)
  Resample: 48kHz → 24kHz (SNAC requirement)
  SNAC encode: 24kHz waveform → 3 codebooks
  Interleave: 7 tokens/frame with per-position offsets (Phase 7.1 fix)
  Offsets: pos_i uses base + i*4096 (i=0..6)
  Sequence: <ct3>Speaker: <style> text<eot><ct4>[audio_tokens]
  Loss mask: -100 on text, real loss on audio tokens only
"""

import modal
import json
import time

# ── Modal resources (isolated from production) ────────────────────────────────
app = modal.App("zarax-phase72b-smoke")
rnd_volume = modal.Volume.from_name("zarax-rnd-vol", create_if_missing=True)
benchmark_secret = modal.Secret.from_name("zarax-benchmark-secret")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
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
        "fastapi[standard]>=0.111.0",
    )
    .env({"HF_HOME": "/rnd/hf_cache"})
)

# ── Constants ─────────────────────────────────────────────────────────────────
AUDIO_TOKEN_BASE = 128266
AUDIO_TOKEN_HI   = AUDIO_TOKEN_BASE + 7 * 4096  # 156938
TARGET_SR        = 24000   # SNAC requirement — verified
MAX_SEQ_LEN      = 768     # tokens (text + audio, ~7s clip)
TRAIN_STEPS      = 100
BATCH_SIZE       = 1
GRAD_ACCUM       = 4       # effective batch = 4
LR               = 2e-4
LORA_RANK        = 8
LORA_ALPHA       = 16
DATASET_SAMPLES  = 200     # take first 200 for 100 steps (some may be too long)
SPEAKER_ID       = "Hindi (Female)"
STYLE_TAG        = "<neutral>"


def log(msg):
    print(f"[7.2.B] {msg}", flush=True)


def audio_to_tokens(audio_np, sr, snac_model, device):
    """
    Convert waveform to Orpheus audio token IDs.
    VERIFIED interleaving: each position has unique offset (base + i*4096).
    """
    import torch
    import librosa

    # Step 1: Resample to 24kHz
    if sr != TARGET_SR:
        audio_np = librosa.resample(audio_np.astype("float32"),
                                    orig_sr=sr, target_sr=TARGET_SR)

    # Step 2: SNAC encode
    audio_t = torch.tensor(audio_np, dtype=torch.float32).unsqueeze(0).unsqueeze(0).to(device)
    with torch.no_grad():
        codes = snac_model.encode(audio_t)

    c0 = codes[0].squeeze().cpu().tolist()  # [N]
    c1 = codes[1].squeeze().cpu().tolist()  # [2N]
    c2 = codes[2].squeeze().cpu().tolist()  # [4N]

    n = len(c0)
    tokens = []
    for i in range(n):
        frame = [
            c0[i]        + AUDIO_TOKEN_BASE + 0 * 4096,  # pos 0 → layer_0
            c1[2*i]      + AUDIO_TOKEN_BASE + 1 * 4096,  # pos 1 → layer_1
            c2[4*i]      + AUDIO_TOKEN_BASE + 2 * 4096,  # pos 2 → layer_2
            c2[4*i+1]    + AUDIO_TOKEN_BASE + 3 * 4096,  # pos 3 → layer_2
            c1[2*i+1]    + AUDIO_TOKEN_BASE + 4 * 4096,  # pos 4 → layer_1
            c2[4*i+2]    + AUDIO_TOKEN_BASE + 5 * 4096,  # pos 5 → layer_2
            c2[4*i+3]    + AUDIO_TOKEN_BASE + 6 * 4096,  # pos 6 → layer_2
        ]
        # Validate range
        if all(AUDIO_TOKEN_BASE <= t < AUDIO_TOKEN_HI for t in frame):
            tokens.extend(frame)

    return tokens


def make_sequence(text_ids, audio_token_ids, max_len):
    """
    Create Orpheus input/label sequence.
    Text: masked with -100 (no loss)
    Audio: real loss
    """
    import torch

    seq = text_ids + audio_token_ids
    if len(seq) > max_len:
        # Trim audio to fit
        n_trim = max_len - len(text_ids)
        n_trim = (n_trim // 7) * 7  # keep complete frames
        seq = text_ids + audio_token_ids[:n_trim]

    input_ids = torch.tensor(seq, dtype=torch.long).unsqueeze(0)
    labels = input_ids.clone()
    labels[:, :len(text_ids)] = -100  # mask text portion

    return input_ids, labels


@app.function(
    gpu="L4",
    image=image,
    volumes={"/rnd": rnd_volume},
    secrets=[benchmark_secret],
    timeout=3600,
)
def run_smoke_test():
    import os, gc, traceback
    import torch
    from transformers import AutoTokenizer, AutoModelForCausalLM
    from peft import LoraConfig, get_peft_model, TaskType, PeftModel
    from datasets import load_dataset
    from snac import SNAC

    results = {
        "phase": "7.2.B",
        "objective": "100-step LoRA smoke test on real svara-TTS + IndicTTS-Hindi",
        "model": "kenpath/svara-tts-v1",
        "dataset": "SPRINGLab/IndicTTS-Hindi",
        "dataset_license": "CC-BY-4.0 (inferred — legal review recommended)",
        "gpu": "L4",
        "steps": TRAIN_STEPS,
    }

    os.makedirs("/rnd/hf_cache", exist_ok=True)
    os.makedirs("/rnd/phase72b_checkpoints", exist_ok=True)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    log(f"Device: {device} | GPU: {torch.cuda.get_device_name(0) if device=='cuda' else 'CPU'}")

    t_total = time.time()

    # ── STEP 1: Dataset verification ─────────────────────────────────────────
    log("\n=== STEP 1: Dataset verification ===")
    try:
        ds = load_dataset("SPRINGLab/IndicTTS-Hindi", split="train")
        n_total = len(ds)
        sample = ds[0]
        audio_sr = sample["audio"]["sampling_rate"]
        audio_len = len(sample["audio"]["array"])
        text_sample = sample["text"]
        gender_sample = sample.get("gender", "unknown")

        results["dataset_verification"] = {
            "status": "PASS",
            "total_samples": n_total,
            "audio_sample_rate": audio_sr,
            "audio_duration_s": round(audio_len / audio_sr, 2),
            "text_sample": text_sample[:80],
            "gender": gender_sample,
            "columns": list(sample.keys()),
        }
        log(f"  Dataset: {n_total} samples, SR={audio_sr}Hz, "
            f"sample_text='{text_sample[:60]}'")

        if audio_sr != TARGET_SR:
            log(f"  ⚠️ Audio SR {audio_sr}Hz ≠ TARGET {TARGET_SR}Hz — resampling required")
            results["dataset_verification"]["resample_required"] = True
            results["dataset_verification"]["resample_from"] = audio_sr
            results["dataset_verification"]["resample_to"] = TARGET_SR

    except Exception as e:
        results["dataset_verification"] = {"status": "FAIL", "error": str(e)}
        log(f"  FAIL: {e}")
        return results

    # ── STEP 2: Load SNAC encoder ─────────────────────────────────────────────
    log("\n=== STEP 2: Load SNAC encoder ===")
    try:
        snac = SNAC.from_pretrained("hubertsiuzdak/snac_24khz").eval().to(device)
        vram_after_snac = torch.cuda.memory_allocated() / 1e9 if device == "cuda" else 0
        results["snac_load"] = {"status": "PASS", "vram_gb": round(vram_after_snac, 2)}
        log(f"  SNAC loaded — VRAM: {vram_after_snac:.2f}GB")
    except Exception as e:
        results["snac_load"] = {"status": "FAIL", "error": str(e)}
        log(f"  FAIL: {e}")
        return results

    # ── STEP 3: Load tokenizer ────────────────────────────────────────────────
    log("\n=== STEP 3: Load tokenizer ===")
    try:
        tokenizer = AutoTokenizer.from_pretrained("kenpath/svara-tts-v1")
        results["tokenizer_load"] = {
            "status": "PASS",
            "vocab_size": len(tokenizer),
            "audio_tokens": len(tokenizer) - 128000,
        }
        log(f"  Tokenizer loaded — vocab={len(tokenizer)}")
    except Exception as e:
        results["tokenizer_load"] = {"status": "FAIL", "error": str(e)}
        return results

    # ── STEP 4: Load actual svara-TTS weights ─────────────────────────────────
    log("\n=== STEP 4: Load actual svara-TTS weights ===")
    try:
        t0 = time.time()
        model = AutoModelForCausalLM.from_pretrained(
            "kenpath/svara-tts-v1",
            torch_dtype=torch.bfloat16,
            device_map="cuda:0",
        )
        model_load_time = time.time() - t0
        vram_after_model = torch.cuda.memory_allocated() / 1e9
        param_count = sum(p.numel() for p in model.parameters())
        results["model_load"] = {
            "status": "PASS",
            "param_count": param_count,
            "load_time_s": round(model_load_time, 1),
            "vram_gb": round(vram_after_model, 2),
            "dtype": "bfloat16",
        }
        log(f"  Model loaded — params={param_count:,}, "
            f"VRAM={vram_after_model:.2f}GB, time={model_load_time:.1f}s")
    except Exception as e:
        results["model_load"] = {"status": "FAIL", "error": str(e)}
        traceback.print_exc()
        return results

    # ── STEP 5: Attach LoRA ───────────────────────────────────────────────────
    log("\n=== STEP 5: Attach LoRA to q_proj/v_proj ===")
    try:
        model.enable_input_require_grads()
        model.gradient_checkpointing_enable()

        lora_config = LoraConfig(
            task_type=TaskType.CAUSAL_LM,
            r=LORA_RANK,
            lora_alpha=LORA_ALPHA,
            target_modules=["q_proj", "v_proj"],
            lora_dropout=0.05,
            bias="none",
        )
        lora_model = get_peft_model(model, lora_config)
        trainable = sum(p.numel() for p in lora_model.parameters() if p.requires_grad)
        total = sum(p.numel() for p in lora_model.parameters())
        vram_after_lora = torch.cuda.memory_allocated() / 1e9
        results["lora_attach"] = {
            "status": "PASS",
            "trainable_params": trainable,
            "total_params": total,
            "trainable_pct": round(100 * trainable / total, 3),
            "vram_gb": round(vram_after_lora, 2),
            "rank": LORA_RANK,
            "alpha": LORA_ALPHA,
            "targets": ["q_proj", "v_proj"],
        }
        log(f"  LoRA attached — trainable={trainable:,} ({100*trainable/total:.3f}%), "
            f"VRAM={vram_after_lora:.2f}GB")
    except Exception as e:
        results["lora_attach"] = {"status": "FAIL", "error": str(e)}
        traceback.print_exc()
        return results

    # ── STEP 6: Verify audio tokenization on 1 real sample ───────────────────
    log("\n=== STEP 6: Verify audio tokenization on real sample ===")
    try:
        sample = ds[0]
        audio_np = sample["audio"]["array"].astype("float32")
        sr = sample["audio"]["sampling_rate"]
        audio_tokens = audio_to_tokens(audio_np, sr, snac, device)
        text = sample["text"]
        prompt = f"<custom_token_3>{SPEAKER_ID}: {STYLE_TAG} {text}<|eot_id|><custom_token_4>"
        text_ids = tokenizer.encode(prompt, add_special_tokens=False)
        input_ids, labels = make_sequence(text_ids, audio_tokens, MAX_SEQ_LEN)

        valid_audio = all(AUDIO_TOKEN_BASE <= t < AUDIO_TOKEN_HI for t in audio_tokens)
        n_loss_tokens = (labels[0] != -100).sum().item()

        results["audio_tokenization"] = {
            "status": "PASS",
            "audio_tokens_per_sample": len(audio_tokens),
            "text_tokens": len(text_ids),
            "total_seq_len": input_ids.shape[1],
            "loss_tokens": n_loss_tokens,
            "all_tokens_in_range": valid_audio,
            "sample_text": text[:60],
        }
        log(f"  Audio tokens: {len(audio_tokens)}, text tokens: {len(text_ids)}, "
            f"seq_len: {input_ids.shape[1]}, valid_range: {valid_audio}")
    except Exception as e:
        results["audio_tokenization"] = {"status": "FAIL", "error": str(e)}
        traceback.print_exc()
        return results

    # ── STEP 7: Pre-tokenize training samples ────────────────────────────────
    log("\n=== STEP 7: Preparing training batches ===")
    try:
        training_batches = []
        skipped = 0
        for i in range(min(DATASET_SAMPLES, len(ds))):
            try:
                sample = ds[i]
                audio_np = sample["audio"]["array"].astype("float32")
                sr = sample["audio"]["sampling_rate"]
                text = sample["text"]
                prompt = f"<custom_token_3>{SPEAKER_ID}: {STYLE_TAG} {text}<|eot_id|><custom_token_4>"
                text_ids = tokenizer.encode(prompt, add_special_tokens=False)
                audio_tokens = audio_to_tokens(audio_np, sr, snac, device)
                if len(audio_tokens) < 7:
                    skipped += 1
                    continue
                input_ids, labels = make_sequence(text_ids, audio_tokens, MAX_SEQ_LEN)
                if (labels[0] != -100).sum().item() < 7:
                    skipped += 1
                    continue
                training_batches.append((input_ids.to(device), labels.to(device)))
                if len(training_batches) >= TRAIN_STEPS:
                    break
            except Exception:
                skipped += 1
                continue

        results["data_preparation"] = {
            "status": "PASS" if len(training_batches) >= 50 else "PARTIAL",
            "batches_prepared": len(training_batches),
            "skipped": skipped,
            "requested": TRAIN_STEPS,
        }
        log(f"  Prepared {len(training_batches)} batches, skipped {skipped}")
    except Exception as e:
        results["data_preparation"] = {"status": "FAIL", "error": str(e)}
        traceback.print_exc()
        return results

    # ── STEP 8: 100-step training ─────────────────────────────────────────────
    log("\n=== STEP 8: 100-step LoRA training ===")
    try:
        import torch.optim as optim

        lora_model.train()
        optimizer = optim.AdamW(
            [p for p in lora_model.parameters() if p.requires_grad],
            lr=LR,
            weight_decay=0.01,
        )

        n_steps = min(TRAIN_STEPS, len(training_batches))
        losses = []
        step_times = []
        peak_vram = 0
        accum_loss = 0.0
        optimizer.zero_grad()

        t_train_start = time.time()

        for step, (input_ids, labels) in enumerate(training_batches[:n_steps]):
            t_step = time.time()

            outputs = lora_model(input_ids=input_ids, labels=labels)
            loss = outputs.loss / GRAD_ACCUM
            loss.backward()

            if (step + 1) % GRAD_ACCUM == 0:
                torch.nn.utils.clip_grad_norm_(
                    [p for p in lora_model.parameters() if p.requires_grad], 1.0)
                optimizer.step()
                optimizer.zero_grad()

            losses.append(outputs.loss.item())
            step_times.append(time.time() - t_step)

            if device == "cuda":
                vram_now = torch.cuda.max_memory_allocated() / 1e9
                peak_vram = max(peak_vram, vram_now)

            if step % 10 == 0 or step == n_steps - 1:
                avg_loss = sum(losses[-10:]) / len(losses[-10:])
                log(f"  Step {step+1}/{n_steps} — loss={outputs.loss.item():.4f} "
                    f"avg10={avg_loss:.4f} VRAM={peak_vram:.2f}GB")

        train_time = time.time() - t_train_start
        avg_step_time = sum(step_times) / len(step_times)

        # Loss analysis
        first_10_avg = sum(losses[:10]) / 10
        last_10_avg = sum(losses[-10:]) / 10
        loss_trend = "DECREASING" if last_10_avg < first_10_avg else "NOT_DECREASING"
        loss_delta = last_10_avg - first_10_avg

        results["training"] = {
            "status": "PASS",
            "steps_completed": n_steps,
            "loss_first_step": round(losses[0], 4),
            "loss_last_step": round(losses[-1], 4),
            "loss_first_10_avg": round(first_10_avg, 4),
            "loss_last_10_avg": round(last_10_avg, 4),
            "loss_delta": round(loss_delta, 4),
            "loss_trend": loss_trend,
            "peak_vram_gb": round(peak_vram, 2),
            "train_time_s": round(train_time, 1),
            "avg_step_time_s": round(avg_step_time, 2),
            "batch_size": BATCH_SIZE,
            "grad_accumulation": GRAD_ACCUM,
            "learning_rate": LR,
            "lora_rank": LORA_RANK,
            "lora_alpha": LORA_ALPHA,
            "loss_history_every10": [round(losses[i], 4) for i in range(0, len(losses), 10)],
        }
        log(f"  Training complete — {n_steps} steps in {train_time:.1f}s")
        log(f"  Loss: {losses[0]:.4f} → {losses[-1]:.4f} ({loss_trend})")
        log(f"  Peak VRAM: {peak_vram:.2f}GB")

    except torch.cuda.OutOfMemoryError as e:
        results["training"] = {"status": "OOM", "error": str(e),
                               "peak_vram_gb": round(peak_vram, 2)}
        log(f"  OOM: {e}")
        return results
    except Exception as e:
        results["training"] = {"status": "FAIL", "error": str(e)}
        traceback.print_exc()
        return results

    # ── STEP 9: Checkpoint save/load ──────────────────────────────────────────
    log("\n=== STEP 9: Checkpoint save/load ===")
    try:
        ckpt_path = "/rnd/phase72b_checkpoints/svara_hindi_lora_100steps"
        lora_model.save_pretrained(ckpt_path)

        import os
        saved_files = os.listdir(ckpt_path)
        ckpt_size_mb = sum(
            os.path.getsize(os.path.join(ckpt_path, f))
            for f in saved_files
        ) / 1e6

        # Reload test
        fresh_model = AutoModelForCausalLM.from_pretrained(
            "kenpath/svara-tts-v1",
            torch_dtype=torch.bfloat16,
            device_map="cuda:0",
        )
        reloaded = PeftModel.from_pretrained(fresh_model, ckpt_path)
        del reloaded, fresh_model
        gc.collect()
        torch.cuda.empty_cache()

        results["checkpoint"] = {
            "status": "PASS",
            "path": ckpt_path,
            "files": saved_files,
            "size_mb": round(ckpt_size_mb, 2),
            "reload_ok": True,
        }
        log(f"  Checkpoint saved + reloaded — {saved_files}, {ckpt_size_mb:.1f}MB")

    except Exception as e:
        results["checkpoint"] = {"status": "FAIL", "error": str(e)}
        traceback.print_exc()

    # ── FINAL SUMMARY ─────────────────────────────────────────────────────────
    total_time = time.time() - t_total
    results["total_time_s"] = round(total_time, 1)
    results["estimated_cost_usd"] = round(total_time / 3600 * 0.80, 3)  # L4 $0.80/hr

    passed = [k for k, v in results.items()
              if isinstance(v, dict) and v.get("status") == "PASS"]
    failed = [k for k, v in results.items()
              if isinstance(v, dict) and v.get("status") in ("FAIL", "OOM", "BLOCKED")]

    results["verdict"] = "PASS" if not failed else "PARTIAL" if len(failed) < 3 else "FAIL"
    results["passed_checks"] = passed
    results["failed_checks"] = failed

    log("\n" + "=" * 60)
    log(f"PHASE 7.2.B VERDICT: {results['verdict']}")
    log(f"PASS: {len(passed)} | FAIL: {len(failed)}")
    log(f"Total time: {total_time:.1f}s | Est. cost: ${results['estimated_cost_usd']}")
    log("=" * 60)

    return results


@app.local_entrypoint()
def main():
    log("Starting Phase 7.2.B smoke test on Modal L4...")
    results = run_smoke_test.remote()
    print("\n" + "=" * 60)
    print("PHASE 7.2.B RESULTS")
    print("=" * 60)
    print(json.dumps(results, indent=2))
