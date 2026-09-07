"""
Zarax Phase 7.2.C — Full LoRA Fine-tune (3 epochs)
====================================================
APPROVED SCOPE:
  Model:    kenpath/svara-tts-v1 (untouched — only LoRA adapter trained)
  Dataset:  SPRINGLab/IndicTTS-Hindi (CC-BY-4.0 inferred, 11,825 samples)
  GPU:      Modal L4 24GB
  Epochs:   3
  Est cost: ~$2.80

PRODUCTION SAFETY:
  - R&D isolated — no production services modified
  - Original svara-TTS weights NEVER overwritten
  - Only LoRA adapter saved separately
  - No deployment to Zarax production

ATTRIBUTION REQUIRED (CC-BY-4.0):
  "Indic TTS: A Text-to-Speech Database for Indian Languages,
   Speech Technology Consortium, IIT Madras (2023)"
"""

import modal
import json
import time
import traceback
import os

# ── Modal resources ───────────────────────────────────────────────────────────
app = modal.App("zarax-phase72c-lora")
rnd_volume = modal.Volume.from_name("zarax-rnd-vol", create_if_missing=True)
benchmark_secret = modal.Secret.from_name("zarax-benchmark-secret")

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
        "fastapi[standard]>=0.111.0",
    )
    .env({"HF_HOME": "/rnd/hf_cache"})
)

# ── Verified constants (from Phase 7.2.A + 7.2.B) ────────────────────────────
AUDIO_TOKEN_BASE = 128266
AUDIO_TOKEN_HI   = AUDIO_TOKEN_BASE + 7 * 4096  # 156938
TARGET_SR        = 24000      # SNAC requirement — verified
MAX_SEQ_LEN      = 768        # tokens — verified fits L4
EPOCHS           = 3
BATCH_SIZE       = 1
GRAD_ACCUM       = 4          # effective batch = 4
LR               = 2e-4
LR_WARMUP_RATIO  = 0.05       # 5% of total steps for warmup
LORA_RANK        = 8
LORA_ALPHA       = 16
LOG_EVERY        = 100        # log every N steps
CKPT_EVERY_EPOCH = True       # save adapter after each epoch
SPEAKER_ID       = "Hindi (Female)"
STYLE_TAG        = "<neutral>"
CKPT_BASE        = "/rnd/phase72c_checkpoints"
LOG_PATH         = "/rnd/phase72c_training_log.jsonl"


def log(msg):
    print(f"[7.2.C] {msg}", flush=True)


def audio_to_tokens(audio_np, sr, snac_model, device):
    """
    VERIFIED in Phase 7.2.A + 7.2.B.
    Resample 48kHz→24kHz, SNAC encode, interleave 7 tokens/frame.
    Per-position offsets: base + i*4096 (i=0..6).
    """
    import torch, librosa

    if sr != TARGET_SR:
        audio_np = librosa.resample(
            audio_np.astype("float32"), orig_sr=sr, target_sr=TARGET_SR
        )
    audio_t = torch.tensor(audio_np, dtype=torch.float32).unsqueeze(0).unsqueeze(0).to(device)
    with torch.no_grad():
        codes = snac_model.encode(audio_t)

    c0 = codes[0].squeeze().cpu().tolist()
    c1 = codes[1].squeeze().cpu().tolist()
    c2 = codes[2].squeeze().cpu().tolist()

    tokens, n = [], len(c0)
    for i in range(n):
        frame = [
            c0[i]     + AUDIO_TOKEN_BASE + 0 * 4096,
            c1[2*i]   + AUDIO_TOKEN_BASE + 1 * 4096,
            c2[4*i]   + AUDIO_TOKEN_BASE + 2 * 4096,
            c2[4*i+1] + AUDIO_TOKEN_BASE + 3 * 4096,
            c1[2*i+1] + AUDIO_TOKEN_BASE + 4 * 4096,
            c2[4*i+2] + AUDIO_TOKEN_BASE + 5 * 4096,
            c2[4*i+3] + AUDIO_TOKEN_BASE + 6 * 4096,
        ]
        if all(AUDIO_TOKEN_BASE <= t < AUDIO_TOKEN_HI for t in frame):
            tokens.extend(frame)
    return tokens


def make_sequence(text_ids, audio_ids, max_len):
    import torch
    n_audio = (min(max_len - len(text_ids), len(audio_ids)) // 7) * 7
    seq = text_ids + audio_ids[:n_audio]
    input_ids = torch.tensor(seq, dtype=torch.long).unsqueeze(0)
    labels = input_ids.clone()
    labels[:, :len(text_ids)] = -100
    return input_ids, labels


def write_log(entry: dict):
    with open(LOG_PATH, "a") as f:
        f.write(json.dumps(entry) + "\n")


@app.function(
    gpu="L4",
    image=image,
    volumes={"/rnd": rnd_volume},
    secrets=[benchmark_secret],
    timeout=21600,  # 6 hours max
)
def run_full_training():
    import torch
    import gc
    from transformers import AutoTokenizer, AutoModelForCausalLM, get_cosine_schedule_with_warmup
    from peft import LoraConfig, get_peft_model, TaskType, PeftModel
    from datasets import load_dataset
    from snac import SNAC
    from torch.optim import AdamW

    os.makedirs(CKPT_BASE, exist_ok=True)
    os.makedirs("/rnd/hf_cache", exist_ok=True)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    t_start = time.time()

    meta = {
        "phase": "7.2.C",
        "model": "kenpath/svara-tts-v1",
        "dataset": "SPRINGLab/IndicTTS-Hindi",
        "dataset_license": "CC-BY-4.0 (inferred)",
        "attribution": "Indic TTS, IIT Madras, Speech Technology Consortium, 2023",
        "gpu": torch.cuda.get_device_name(0) if device == "cuda" else "CPU",
        "lora_rank": LORA_RANK, "lora_alpha": LORA_ALPHA,
        "target_modules": ["q_proj", "v_proj"],
        "batch_size": BATCH_SIZE, "grad_accumulation": GRAD_ACCUM,
        "effective_batch": BATCH_SIZE * GRAD_ACCUM,
        "epochs": EPOCHS, "lr": LR, "max_seq_len": MAX_SEQ_LEN,
        "dtype": "bfloat16",
    }
    log("=" * 60)
    log("ZARAX PHASE 7.2.C — FULL LoRA FINE-TUNE")
    log(f"GPU: {meta['gpu']} | Epochs: {EPOCHS} | LR: {LR}")
    log("=" * 60)

    # ── STEP 1: Dataset ───────────────────────────────────────────────────────
    log("\n=== STEP 1: Load dataset ===")
    ds = load_dataset("SPRINGLab/IndicTTS-Hindi", split="train")
    meta["dataset_total_samples"] = len(ds)
    log(f"  Loaded {len(ds)} samples")

    # ── STEP 2: SNAC ─────────────────────────────────────────────────────────
    log("\n=== STEP 2: Load SNAC encoder ===")
    snac = SNAC.from_pretrained("hubertsiuzdak/snac_24khz").eval().to(device)
    log(f"  SNAC loaded — VRAM: {torch.cuda.memory_allocated()/1e9:.2f}GB")

    # ── STEP 3: Tokenizer ─────────────────────────────────────────────────────
    log("\n=== STEP 3: Load tokenizer ===")
    tokenizer = AutoTokenizer.from_pretrained("kenpath/svara-tts-v1")
    log(f"  Tokenizer vocab={len(tokenizer)}")

    # ── STEP 4: Pre-tokenize all samples ─────────────────────────────────────
    log("\n=== STEP 4: Pre-tokenize all samples (one-time, cached for 3 epochs) ===")
    t_tok = time.time()
    training_batches = []
    skipped = 0
    skip_reasons = {"too_short": 0, "tokenize_error": 0, "no_loss_tokens": 0}

    for i in range(len(ds)):
        try:
            sample = ds[i]
            audio_np = sample["audio"]["array"].astype("float32")
            sr = sample["audio"]["sampling_rate"]
            text = sample["text"]
            prompt = f"<custom_token_3>{SPEAKER_ID}: {STYLE_TAG} {text}<|eot_id|><custom_token_4>"
            text_ids = tokenizer.encode(prompt, add_special_tokens=False)
            audio_tokens = audio_to_tokens(audio_np, sr, snac, device)
            if len(audio_tokens) < 7:
                skipped += 1; skip_reasons["too_short"] += 1; continue
            input_ids, labels = make_sequence(text_ids, audio_tokens, MAX_SEQ_LEN)
            if (labels[0] != -100).sum().item() < 7:
                skipped += 1; skip_reasons["no_loss_tokens"] += 1; continue
            training_batches.append((input_ids.cpu(), labels.cpu()))
        except Exception:
            skipped += 1; skip_reasons["tokenize_error"] += 1; continue

        if (i + 1) % 1000 == 0:
            log(f"  Tokenized {i+1}/{len(ds)} samples ({skipped} skipped)...")

    tok_time = time.time() - t_tok
    meta["valid_samples"] = len(training_batches)
    meta["skipped_samples"] = skipped
    meta["skip_reasons"] = skip_reasons
    meta["tokenization_time_s"] = round(tok_time, 1)

    steps_per_epoch = len(training_batches)
    total_steps = steps_per_epoch * EPOCHS
    optimizer_steps_per_epoch = steps_per_epoch // GRAD_ACCUM
    total_optimizer_steps = optimizer_steps_per_epoch * EPOCHS
    warmup_steps = int(total_optimizer_steps * LR_WARMUP_RATIO)

    meta["steps_per_epoch"] = steps_per_epoch
    meta["total_forward_steps"] = total_steps
    meta["optimizer_steps_per_epoch"] = optimizer_steps_per_epoch
    meta["total_optimizer_steps"] = total_optimizer_steps
    meta["warmup_steps"] = warmup_steps

    log(f"  Valid samples: {len(training_batches)} | Skipped: {skipped}")
    log(f"  Steps/epoch: {steps_per_epoch} | Total: {total_steps} | "
        f"Optimizer steps: {total_optimizer_steps}")
    log(f"  Warmup steps: {warmup_steps} | Tokenization: {tok_time:.1f}s")

    # ── STEP 5: Load model ────────────────────────────────────────────────────
    log("\n=== STEP 5: Load actual svara-TTS weights ===")
    t_load = time.time()
    model = AutoModelForCausalLM.from_pretrained(
        "kenpath/svara-tts-v1",
        torch_dtype=torch.bfloat16,
        device_map="cuda:0",
    )
    load_time = time.time() - t_load
    param_count = sum(p.numel() for p in model.parameters())
    vram_model = torch.cuda.memory_allocated() / 1e9
    meta["param_count"] = param_count
    meta["model_load_time_s"] = round(load_time, 1)
    meta["vram_after_model_gb"] = round(vram_model, 2)
    log(f"  Model loaded — params={param_count:,}, VRAM={vram_model:.2f}GB, time={load_time:.1f}s")

    # ── STEP 6: Attach LoRA ───────────────────────────────────────────────────
    log("\n=== STEP 6: Attach LoRA ===")
    model.enable_input_require_grads()
    model.gradient_checkpointing_enable()
    lora_cfg = LoraConfig(
        task_type=TaskType.CAUSAL_LM, r=LORA_RANK, lora_alpha=LORA_ALPHA,
        target_modules=["q_proj", "v_proj"], lora_dropout=0.05, bias="none",
    )
    lora_model = get_peft_model(model, lora_cfg)
    trainable = sum(p.numel() for p in lora_model.parameters() if p.requires_grad)
    meta["trainable_params"] = trainable
    meta["trainable_pct"] = round(100 * trainable / param_count, 3)
    log(f"  LoRA attached — trainable={trainable:,} ({meta['trainable_pct']}%)")

    # ── STEP 7: Optimizer + Scheduler ────────────────────────────────────────
    log("\n=== STEP 7: Setup optimizer + cosine scheduler ===")
    optimizer = AdamW(
        [p for p in lora_model.parameters() if p.requires_grad],
        lr=LR, weight_decay=0.01,
    )
    scheduler = get_cosine_schedule_with_warmup(
        optimizer,
        num_warmup_steps=warmup_steps,
        num_training_steps=total_optimizer_steps,
    )
    meta["scheduler"] = "cosine_with_warmup"
    log(f"  AdamW + cosine warmup ready")

    # ── STEP 8: Full 3-epoch training ─────────────────────────────────────────
    log("\n=== STEP 8: Training (3 epochs) ===")
    lora_model.train()
    all_losses = []
    epoch_stats = []
    peak_vram = 0
    global_step = 0
    optimizer_step_count = 0
    nan_count = 0

    t_train = time.time()
    optimizer.zero_grad()

    for epoch in range(EPOCHS):
        log(f"\n--- Epoch {epoch+1}/{EPOCHS} ---")
        epoch_losses = []
        t_epoch = time.time()

        # Shuffle within epoch (deterministic per epoch)
        import random
        random.seed(42 + epoch)
        indices = list(range(len(training_batches)))
        random.shuffle(indices)

        for local_step, idx in enumerate(indices):
            input_ids, labels = training_batches[idx]
            input_ids = input_ids.to(device)
            labels = labels.to(device)

            try:
                outputs = lora_model(input_ids=input_ids, labels=labels)
                loss = outputs.loss / GRAD_ACCUM

                # NaN/Inf check
                if torch.isnan(loss) or torch.isinf(loss):
                    nan_count += 1
                    log(f"  ⚠️ NaN/Inf loss at epoch={epoch+1} step={local_step+1}. Skipping.")
                    optimizer.zero_grad()
                    if nan_count > 10:
                        log("  STOP: >10 NaN losses. Training unstable.")
                        meta["training_status"] = "STOPPED_NAN"
                        break
                    continue

                loss.backward()
                epoch_losses.append(outputs.loss.item())
                all_losses.append(outputs.loss.item())
                global_step += 1

                if global_step % GRAD_ACCUM == 0:
                    torch.nn.utils.clip_grad_norm_(
                        [p for p in lora_model.parameters() if p.requires_grad], 1.0
                    )
                    optimizer.step()
                    scheduler.step()
                    optimizer.zero_grad()
                    optimizer_step_count += 1

                # VRAM tracking
                if device == "cuda":
                    vram_now = torch.cuda.max_memory_allocated() / 1e9
                    peak_vram = max(peak_vram, vram_now)

                # Logging
                if global_step % LOG_EVERY == 0:
                    avg10 = sum(all_losses[-10:]) / len(all_losses[-10:])
                    lr_now = scheduler.get_last_lr()[0]
                    log(f"  E{epoch+1} step={global_step} loss={outputs.loss.item():.4f} "
                        f"avg10={avg10:.4f} VRAM={peak_vram:.2f}GB lr={lr_now:.2e}")
                    write_log({
                        "epoch": epoch + 1, "global_step": global_step,
                        "loss": round(outputs.loss.item(), 4),
                        "avg10_loss": round(avg10, 4),
                        "lr": lr_now, "peak_vram_gb": round(peak_vram, 2),
                    })

            except torch.cuda.OutOfMemoryError:
                log(f"  OOM at epoch={epoch+1} step={local_step+1}")
                meta["training_status"] = "OOM"
                torch.cuda.empty_cache()
                optimizer.zero_grad()
                break
            except Exception as e:
                log(f"  Error at step {local_step+1}: {e}")
                continue

        epoch_time = time.time() - t_epoch
        epoch_avg_loss = sum(epoch_losses) / len(epoch_losses) if epoch_losses else 0

        epoch_stat = {
            "epoch": epoch + 1,
            "steps": len(epoch_losses),
            "avg_loss": round(epoch_avg_loss, 4),
            "first_loss": round(epoch_losses[0], 4) if epoch_losses else None,
            "last_loss": round(epoch_losses[-1], 4) if epoch_losses else None,
            "time_s": round(epoch_time, 1),
        }
        epoch_stats.append(epoch_stat)
        log(f"  Epoch {epoch+1} done — avg_loss={epoch_avg_loss:.4f}, "
            f"steps={len(epoch_losses)}, time={epoch_time:.1f}s")

        # Save checkpoint per epoch
        if CKPT_EVERY_EPOCH:
            ckpt_path = f"{CKPT_BASE}/epoch_{epoch+1}"
            os.makedirs(ckpt_path, exist_ok=True)
            lora_model.save_pretrained(ckpt_path)
            ckpt_files = os.listdir(ckpt_path)
            ckpt_size = sum(
                os.path.getsize(os.path.join(ckpt_path, f)) for f in ckpt_files
            ) / 1e6
            log(f"  Checkpoint saved → {ckpt_path} ({ckpt_size:.1f}MB) | files: {ckpt_files}")
            write_log({"event": "checkpoint", "epoch": epoch + 1,
                       "path": ckpt_path, "size_mb": round(ckpt_size, 1)})

    total_train_time = time.time() - t_train
    total_time = time.time() - t_start

    # ── STEP 9: Final checkpoint ───────────────────────────────────────────────
    log("\n=== STEP 9: Save final checkpoint ===")
    final_ckpt = f"{CKPT_BASE}/final"
    os.makedirs(final_ckpt, exist_ok=True)

    # Save training metadata alongside checkpoint
    lora_model.save_pretrained(final_ckpt)
    final_files = os.listdir(final_ckpt)
    final_size = sum(
        os.path.getsize(os.path.join(final_ckpt, f)) for f in final_files
    ) / 1e6

    with open(f"{final_ckpt}/training_config.json", "w") as f:
        json.dump({**meta, "epoch_stats": epoch_stats,
                   "total_train_time_s": round(total_train_time, 1)}, f, indent=2)

    log(f"  Final checkpoint → {final_ckpt} ({final_size:.1f}MB)")

    # Checkpoint reload verification
    try:
        fresh = AutoModelForCausalLM.from_pretrained(
            "kenpath/svara-tts-v1", torch_dtype=torch.bfloat16, device_map="cuda:0"
        )
        reloaded = PeftModel.from_pretrained(fresh, final_ckpt)
        del reloaded, fresh; gc.collect(); torch.cuda.empty_cache()
        ckpt_reload_ok = True
        log("  Checkpoint reload: ✅ PASS")
    except Exception as e:
        ckpt_reload_ok = False
        log(f"  Checkpoint reload: ❌ FAIL — {e}")

    # ── FINAL REPORT ──────────────────────────────────────────────────────────
    first_loss = all_losses[0] if all_losses else None
    last_loss = all_losses[-1] if all_losses else None
    avg_loss = sum(all_losses) / len(all_losses) if all_losses else None
    first_100_avg = sum(all_losses[:100]) / 100 if len(all_losses) >= 100 else None
    last_100_avg = sum(all_losses[-100:]) / 100 if len(all_losses) >= 100 else None
    loss_trend = "DECREASING" if (last_loss and first_loss and last_loss < first_loss) else "NOT_DECREASING"

    report = {
        "phase": "7.2.C",
        "verdict": meta.get("training_status", "PASS"),

        "model": {
            "identifier": "kenpath/svara-tts-v1",
            "param_count": param_count,
            "dtype": "bfloat16",
        },
        "dataset": {
            "identifier": "SPRINGLab/IndicTTS-Hindi",
            "license": "CC-BY-4.0 (inferred)",
            "total_samples": meta["dataset_total_samples"],
            "valid_samples": meta["valid_samples"],
            "skipped_samples": meta["skipped_samples"],
            "skip_reasons": meta["skip_reasons"],
        },
        "training": {
            "epochs": EPOCHS,
            "steps_per_epoch": steps_per_epoch,
            "total_forward_steps": total_steps,
            "total_optimizer_steps": total_optimizer_steps,
            "warmup_steps": warmup_steps,
            "effective_batch_size": BATCH_SIZE * GRAD_ACCUM,
            "lr": LR, "scheduler": "cosine_with_warmup",
            "lora_rank": LORA_RANK, "lora_alpha": LORA_ALPHA,
            "target_modules": ["q_proj", "v_proj"],
            "trainable_params": trainable,
            "trainable_pct": meta["trainable_pct"],
            "epoch_stats": epoch_stats,
        },
        "loss": {
            "first_step": first_loss,
            "last_step": last_loss,
            "avg_all": round(avg_loss, 4) if avg_loss else None,
            "first_100_avg": round(first_100_avg, 4) if first_100_avg else None,
            "last_100_avg": round(last_100_avg, 4) if last_100_avg else None,
            "trend": loss_trend,
            "nan_count": nan_count,
        },
        "gpu": {
            "type": meta["gpu"],
            "peak_vram_gb": round(peak_vram, 2),
            "oom": meta.get("training_status") == "OOM",
        },
        "cost": {
            "total_time_s": round(total_time, 1),
            "train_time_s": round(total_train_time, 1),
            "estimated_cost_usd": round(total_time / 3600 * 0.80, 3),
        },
        "checkpoints": {
            "epoch_checkpoints": [f"{CKPT_BASE}/epoch_{i+1}" for i in range(EPOCHS)],
            "final": final_ckpt,
            "final_size_mb": round(final_size, 1),
            "files": final_files,
            "reload_verified": ckpt_reload_ok,
        },
        "not_proven": [
            "Hindi MOS improvement (requires human listening evaluation)",
            "English regression (requires separate evaluation)",
            "Hinglish quality",
            "Same-user voice identity preservation",
            "Cross-language voice identity",
            "Emotion/style/pitch/energy control",
        ],
        "next_step": "Phase 7.2.D — evaluation: WER + human MOS + English regression",
    }

    log("\n" + "=" * 60)
    log(f"PHASE 7.2.C VERDICT: {report['verdict']}")
    log(f"Loss: {first_loss:.4f} → {last_loss:.4f} ({loss_trend})")
    log(f"Peak VRAM: {peak_vram:.2f}GB")
    log(f"Time: {total_time/3600:.2f}hrs | Cost: ${report['cost']['estimated_cost_usd']}")
    log("=" * 60)
    log("\nNOT PROVEN: Hindi MOS improvement, English regression, voice identity")
    log("STOP — awaiting Phase 7.2.D approval for evaluation")

    return report


@app.local_entrypoint()
def main():
    log("Phase 7.2.C starting on Modal L4...")
    log(f"Estimated: ~3.5 hours, ~$2.80")
    log("STOP CONDITIONS: NaN>10, OOM, checkpoint failure")
    report = run_full_training.remote()
    print("\n" + "=" * 60)
    print("PHASE 7.2.C FINAL REPORT")
    print("=" * 60)
    print(json.dumps(report, indent=2))
    with open("phase72c_report.json", "w") as f:
        json.dump(report, f, indent=2)
    log("Report saved to phase72c_report.json")
  
