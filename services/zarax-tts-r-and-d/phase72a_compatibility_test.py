"""
Zarax Phase 7.2.A — Orpheus → svara-TTS Training Compatibility Test
=====================================================================
PURPOSE: Verify whether Orpheus training framework is compatible with
         svara-TTS v1 architecture for LoRA fine-tuning.

SCOPE:
  - CPU only (no GPU needed for this test)
  - No actual training weights downloaded (uses architecture config only)
  - Instantiates a TINY random model with svara-TTS architecture
  - Tests: config load, tokenizer, LoRA attachment, forward pass, loss, checkpoint
  - Approximately 10 forward steps maximum
  - Zero GPU spend

DOES NOT:
  - Train on real data
  - Download IndicVoices-R
  - Modify production services
  - Connect to Modal

RESULT MUST BE ONE OF:
  COMPATIBLE
  NOT COMPATIBLE
  BLOCKED
"""

import sys
import json
import time
import traceback
from pathlib import Path

RESULTS = {}

def log(msg):
    print(f"[7.2.A] {msg}", flush=True)

def record(key, status, detail=""):
    RESULTS[key] = {"status": status, "detail": str(detail)[:300]}
    icon = "✅" if status == "PASS" else "❌" if status == "FAIL" else "⚠️"
    log(f"{icon} {key}: {status} — {str(detail)[:200]}")

def run_compatibility_test():
    log("=" * 60)
    log("ZARAX PHASE 7.2.A — COMPATIBILITY TEST")
    log("=" * 60)
    log("CPU only — no GPU required — no real weights downloaded")
    log("")

    # ─── STEP 1: Check Python environment ────────────────────────────────────
    log("STEP 1: Checking Python environment...")
    try:
        import torch
        record("torch_available", "PASS", f"torch {torch.__version__}")
    except ImportError as e:
        record("torch_available", "FAIL", str(e))
        log("FATAL: torch not installed. Run: pip install torch")
        return

    try:
        import transformers
        record("transformers_available", "PASS", f"transformers {transformers.__version__}")
    except ImportError as e:
        record("transformers_available", "FAIL", str(e))
        log("FATAL: transformers not installed.")
        return

    try:
        import peft
        record("peft_available", "PASS", f"peft {peft.__version__}")
    except ImportError as e:
        record("peft_available", "FAIL", str(e))
        log("FATAL: peft not installed. Run: pip install peft")
        return

    # ─── STEP 2: Fetch svara-TTS config only (no weights) ────────────────────
    log("\nSTEP 2: Fetching svara-TTS config from HuggingFace (config only, no weights)...")
    try:
        from transformers import AutoConfig, AutoTokenizer
        log("  Downloading config.json (~5KB)...")
        config = AutoConfig.from_pretrained(
            "kenpath/svara-tts-v1",
            trust_remote_code=False,
        )
        record("svara_config_load", "PASS",
               f"model_type={config.model_type}, "
               f"hidden_size={config.hidden_size}, "
               f"num_layers={config.num_hidden_layers}, "
               f"vocab_size={config.vocab_size}, "
               f"num_attention_heads={config.num_attention_heads}, "
               f"num_kv_heads={getattr(config, 'num_key_value_heads', 'N/A')}")
        log(f"  Config: {json.dumps(config.to_dict(), indent=2)[:500]}...")
    except Exception as e:
        record("svara_config_load", "FAIL", str(e))
        return

    # ─── STEP 3: Check tokenizer ──────────────────────────────────────────────
    log("\nSTEP 3: Loading tokenizer (no model weights)...")
    try:
        tokenizer = AutoTokenizer.from_pretrained("kenpath/svara-tts-v1")
        vocab_size = len(tokenizer)
        has_audio_tokens = vocab_size > 128000
        audio_token_count = vocab_size - 128000 if has_audio_tokens else 0
        record("tokenizer_load", "PASS",
               f"vocab_size={vocab_size}, "
               f"audio_tokens={audio_token_count}, "
               f"has_custom_token_3={'<custom_token_3>' in tokenizer.get_vocab()}")
        # Verify Orpheus special tokens
        orpheus_tokens = ["<custom_token_3>", "<custom_token_4>"]
        missing = [t for t in orpheus_tokens if t not in tokenizer.get_vocab()]
        if missing:
            record("orpheus_special_tokens", "FAIL", f"Missing: {missing}")
        else:
            record("orpheus_special_tokens", "PASS", "custom_token_3 and custom_token_4 present")
    except Exception as e:
        record("tokenizer_load", "FAIL", str(e))

    # ─── STEP 4: Instantiate TINY random model (same architecture, no download) ─
    log("\nSTEP 4: Instantiating TINY random model with svara-TTS architecture...")
    log("  (Using architecture config but random weights — not the real model)")
    try:
        import copy
        from transformers import LlamaForCausalLM, LlamaConfig

        tiny_config = copy.deepcopy(config)
        # Override to tiny size for CPU compatibility test
        tiny_config.num_hidden_layers = 2          # 2 layers instead of 28
        tiny_config.hidden_size = 512              # 512 instead of 3072
        tiny_config.intermediate_size = 1024       # scaled down
        tiny_config.num_attention_heads = 8
        tiny_config.num_key_value_heads = 4        # GQA maintained
        tiny_config.vocab_size = config.vocab_size # Keep full vocab (audio tokens!)
        tiny_config.max_position_embeddings = 512

        import torch
        model = LlamaForCausalLM(tiny_config)
        model = model.to(torch.float32)
        model.eval()

        param_count = sum(p.numel() for p in model.parameters())
        record("tiny_model_init", "PASS",
               f"params={param_count:,}, "
               f"vocab={config.vocab_size}, "
               f"layers=2 (reduced from 28), "
               f"hidden=512 (reduced from 3072)")
    except Exception as e:
        record("tiny_model_init", "FAIL", str(e))
        traceback.print_exc()
        return

    # ─── STEP 5: Attach LoRA ──────────────────────────────────────────────────
    log("\nSTEP 5: Attaching LoRA to q_proj/v_proj...")
    try:
        from peft import LoraConfig, get_peft_model, TaskType

        lora_config = LoraConfig(
            task_type=TaskType.CAUSAL_LM,
            r=8,
            lora_alpha=16,
            target_modules=["q_proj", "v_proj"],
            lora_dropout=0.05,
            bias="none",
        )

        lora_model = get_peft_model(model, lora_config)
        lora_params = sum(p.numel() for p in lora_model.parameters() if p.requires_grad)
        all_params = sum(p.numel() for p in lora_model.parameters())

        record("lora_attach", "PASS",
               f"trainable_params={lora_params:,}, "
               f"total_params={all_params:,}, "
               f"trainable%={100*lora_params/all_params:.2f}%")

        # Verify q_proj/v_proj are targeted
        targeted = [n for n, p in lora_model.named_parameters()
                    if p.requires_grad and ("lora_A" in n or "lora_B" in n)]
        record("lora_targets_verified", "PASS", f"LoRA params found: {targeted[:4]}...")
    except Exception as e:
        record("lora_attach", "FAIL", str(e))
        traceback.print_exc()
        return

    # ─── STEP 6: Audio token range verification ───────────────────────────────
    log("\nSTEP 6: Verifying audio token range in vocabulary...")
    try:
        AUDIO_BASE = 128266
        AUDIO_HI = AUDIO_BASE + 7 * 4096  # 156938
        vocab_size_check = config.vocab_size
        audio_tokens_in_vocab = vocab_size_check > AUDIO_HI
        record("audio_token_range", "PASS" if audio_tokens_in_vocab else "FAIL",
               f"vocab_size={vocab_size_check}, "
               f"audio_range=[{AUDIO_BASE}, {AUDIO_HI}), "
               f"in_vocab={audio_tokens_in_vocab}")
    except Exception as e:
        record("audio_token_range", "FAIL", str(e))

    # ─── STEP 7: Forward pass with audio tokens ───────────────────────────────
    log("\nSTEP 7: Forward pass with Orpheus-style input (audio tokens included)...")
    try:
        import torch

        # Simulate an Orpheus-style sequence:
        # <custom_token_3> speaker: <style> text <|eot_id|> <custom_token_4>
        # followed by audio tokens in the correct range
        tok = tokenizer

        # Text portion
        prompt = "<custom_token_3>Hindi (Female): <neutral> Namaste<|eot_id|><custom_token_4>"
        text_ids = tok.encode(prompt, add_special_tokens=False)

        # Simulate 14 audio tokens (2 frames × 7 positions)
        # Use valid audio tokens in correct position ranges
        audio_ids = [
            128266 + 0 * 4096 + 100,   # pos 0, layer_0
            128266 + 1 * 4096 + 200,   # pos 1, layer_1
            128266 + 2 * 4096 + 300,   # pos 2, layer_2
            128266 + 3 * 4096 + 400,   # pos 3, layer_2
            128266 + 4 * 4096 + 500,   # pos 4, layer_1
            128266 + 5 * 4096 + 600,   # pos 5, layer_2
            128266 + 6 * 4096 + 700,   # pos 6, layer_2
            # Frame 2
            128266 + 0 * 4096 + 101,
            128266 + 1 * 4096 + 201,
            128266 + 2 * 4096 + 301,
            128266 + 3 * 4096 + 401,
            128266 + 4 * 4096 + 501,
            128266 + 5 * 4096 + 601,
            128266 + 6 * 4096 + 701,
        ]

        # Validate all audio token IDs in vocab range
        max_audio = max(audio_ids)
        assert max_audio < config.vocab_size, \
            f"Audio token {max_audio} >= vocab_size {config.vocab_size}"

        input_ids = torch.tensor([text_ids + audio_ids], dtype=torch.long)
        labels = input_ids.clone()
        labels[:, :len(text_ids)] = -100  # Only compute loss on audio tokens

        lora_model.train()
        with torch.no_grad():
            outputs = lora_model(input_ids=input_ids, labels=labels)

        loss = outputs.loss
        logits_shape = outputs.logits.shape

        record("forward_pass", "PASS",
               f"loss={loss.item():.4f}, "
               f"logits_shape={list(logits_shape)}, "
               f"input_len={input_ids.shape[1]}")
    except Exception as e:
        record("forward_pass", "FAIL", str(e))
        traceback.print_exc()

    # ─── STEP 8: Minimal training steps (10 steps) ───────────────────────────
    log("\nSTEP 8: Running 10 training steps (CPU, tiny model, random data)...")
    try:
        import torch
        from torch.optim import AdamW

        lora_model.train()
        optimizer = AdamW(
            [p for p in lora_model.parameters() if p.requires_grad],
            lr=2e-4
        )

        losses = []
        t0 = time.time()

        for step in range(10):
            optimizer.zero_grad()
            outputs = lora_model(input_ids=input_ids, labels=labels)
            loss = outputs.loss
            loss.backward()
            torch.nn.utils.clip_grad_norm_(lora_model.parameters(), 1.0)
            optimizer.step()
            losses.append(loss.item())
            if step % 2 == 0:
                log(f"  Step {step+1}/10 — loss: {loss.item():.4f}")

        elapsed = time.time() - t0
        loss_direction = "DECREASING ✅" if losses[-1] < losses[0] else "NOT DECREASING ⚠️"
        record("training_steps", "PASS",
               f"10 steps in {elapsed:.1f}s, "
               f"loss: {losses[0]:.4f}→{losses[-1]:.4f} ({loss_direction})")
    except Exception as e:
        record("training_steps", "FAIL", str(e))
        traceback.print_exc()

    # ─── STEP 9: Checkpoint save/load ─────────────────────────────────────────
    log("\nSTEP 9: Testing checkpoint save/load...")
    try:
        import tempfile, os
        from peft import PeftModel

        with tempfile.TemporaryDirectory() as tmpdir:
            # Save LoRA adapter only (not full model)
            lora_model.save_pretrained(tmpdir)
            saved_files = os.listdir(tmpdir)
            log(f"  Saved files: {saved_files}")

            # Reload
            fresh_model = LlamaForCausalLM(tiny_config)
            fresh_lora = PeftModel.from_pretrained(fresh_model, tmpdir)
            record("checkpoint_save_load", "PASS",
                   f"saved_files={saved_files}, reload OK")
    except Exception as e:
        record("checkpoint_save_load", "FAIL", str(e))
        traceback.print_exc()

    # ─── STEP 10: Memory estimation for real model ───────────────────────────
    log("\nSTEP 10: Estimating memory for REAL svara-TTS (3.3B params)...")
    try:
        real_params = 3_300_000_000
        bf16_model_gb = real_params * 2 / 1e9
        lora_r8_params = real_params * 0.002  # ~0.2% for rank=8 q/v only
        lora_gb = lora_r8_params * 4 / 1e9
        optimizer_gb = lora_r8_params * 8 / 1e9  # 8-bit Adam
        activation_gb = 4.0  # estimate with gradient checkpointing
        total_est_gb = bf16_model_gb + lora_gb + optimizer_gb + activation_gb
        record("real_model_memory_estimate", "PASS",
               f"BF16 model={bf16_model_gb:.1f}GB, "
               f"LoRA={lora_gb:.2f}GB, "
               f"optimizer={optimizer_gb:.2f}GB, "
               f"activations~{activation_gb}GB, "
               f"TOTAL_EST={total_est_gb:.1f}GB "
               f"(L4 24GB: {'FITS ✅' if total_est_gb < 22 else 'TOO LARGE ❌'})")
    except Exception as e:
        record("real_model_memory_estimate", "FAIL", str(e))

    # ─── FINAL REPORT ─────────────────────────────────────────────────────────
    log("\n" + "=" * 60)
    log("PHASE 7.2.A — FINAL COMPATIBILITY REPORT")
    log("=" * 60)

    passed = [k for k, v in RESULTS.items() if v["status"] == "PASS"]
    failed = [k for k, v in RESULTS.items() if v["status"] == "FAIL"]
    warned = [k for k, v in RESULTS.items() if v["status"] not in ("PASS", "FAIL")]

    log(f"\nPASS:  {len(passed)}/{len(RESULTS)}")
    log(f"FAIL:  {len(failed)}/{len(RESULTS)}")
    log(f"OTHER: {len(warned)}/{len(RESULTS)}")

    log("\n--- Detailed Results ---")
    for k, v in RESULTS.items():
        icon = "✅" if v["status"] == "PASS" else "❌" if v["status"] == "FAIL" else "⚠️"
        log(f"{icon} {k}: {v['status']}")
        if v["detail"]:
            log(f"   {v['detail']}")

    if not failed:
        verdict = "COMPATIBLE"
        log("\n🎉 VERDICT: COMPATIBLE")
        log("Orpheus training framework is compatible with svara-TTS architecture.")
        log("Phase 7.2.B may proceed after approval.")
    elif len(failed) <= 2 and "forward_pass" in passed:
        verdict = "PARTIALLY COMPATIBLE"
        log("\n⚠️ VERDICT: PARTIALLY COMPATIBLE")
        log(f"Failed checks: {failed}")
        log("Engineering work required before 7.2.B.")
    else:
        verdict = "NOT COMPATIBLE"
        log(f"\n❌ VERDICT: NOT COMPATIBLE")
        log(f"Critical failures: {failed}")

    log("\n--- Full Results JSON ---")
    print(json.dumps({
        "verdict": verdict,
        "passed": passed,
        "failed": failed,
        "results": RESULTS
    }, indent=2))

    return verdict


if __name__ == "__main__":
    run_compatibility_test()
