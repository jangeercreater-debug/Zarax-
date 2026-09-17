"""
Zarax G4-A Step-2000 → Step-5000 Continuation (v3 - syntax fixed)
CHECKPOINT TYPE: ADAPTER-ONLY — weight continuation, not full-state resume
LOCKED: same model/LoRA/LR/EOS/SNAC/dataset as G4-A
"""
import modal, json, time, os, gc, csv, hashlib, traceback
from datetime import datetime

app = modal.App("zarax-phase72g4-continuation")
rnd_volume = modal.Volume.from_name("zarax-rnd-vol", create_if_missing=True)
hf_secret = modal.Secret.from_name("zarax-rnd-hf-secret")
benchmark_secret = modal.Secret.from_name("zarax-benchmark-secret")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "torchcodec>=0.1.0","transformers>=4.46.0","torch>=2.4.0",
        "torchaudio>=2.4.0","peft>=0.12.0","accelerate>=0.26.0",
        "datasets>=2.20.0","snac>=1.2.1","soundfile>=0.12.1",
        "numpy>=1.24.0","librosa>=0.10.0","openai-whisper>=20231117",
        "jiwer>=3.0.0","matplotlib>=3.8.0","huggingface_hub>=0.24.0",
        "fastapi[standard]>=0.111.0",
    )
    .env({"HF_HOME": "/rnd/hf_cache"})
)

START_STEP       = 2000
TARGET_STEP      = 5000
REMAINING        = 3000
CKPT_STEPS       = [2500, 3000, 3500, 4000, 4500, 5000]
AUDIO_BASE       = 128266
AUDIO_HI         = AUDIO_BASE + 7 * 4096
EOS              = 128258
TARGET_SR        = 24000
MAX_LEN          = 768
GRAD_ACCUM       = 4
LR               = 5e-5
LORA_R           = 8
LORA_A           = 16
WARMUP_ORIG      = 62
TOTAL_OPT_ORIG   = 1250
DONE_OPT         = 500
SPEAKER          = "Hindi (Female)"
STYLE            = "<neutral>"
BASE_DIR         = "/rnd/phase72g4"
CKPT_DIR         = f"{BASE_DIR}/checkpoints"
CONT_DIR         = f"{BASE_DIR}/continuation"
STEP2000         = f"{CKPT_DIR}/step_02000"

BASELINES = {
    "BASE":     {"hi": 0.900, "en": 0.155},
    "F2@100":   {"hi": 0.961, "en": 0.163},
    "G3@500":   {"hi": 1.113, "en": 0.393},
    "G4A@2000": {"hi": 0.943, "en": 0.259},
}

EVAL_HI = [
    {"id":"hi_01","text":"Namaste, aap kaise hain aaj?"},
    {"id":"hi_02","text":"Kya main aapki madad kar sakta hoon?"},
    {"id":"hi_03","text":"Dhanyavad."},
    {"id":"hi_04","text":"Theek hai."},
    {"id":"hi_05","text":"Mera naam Zarax hai aur main aapka AI assistant hoon."},
    {"id":"hi_06","text":"Aapki appointment kal teen baje scheduled hai."},
    {"id":"hi_07","text":"Hamare platform par aap apni awaaz clone kar sakte hain aur phir usi awaaz mein jawab pa sakte hain."},
    {"id":"hi_08","text":"Is mahine ki report mein unhone bataya ki company ka maalik Mukesh Ambani ne naya investment kiya hai."},
    {"id":"hi_09","text":"Pratigya aur pratibaddh vyakti ne pratirodh ka saamna kiya."},
    {"id":"hi_10","text":"Vigyaan aur takneek ke kshetra mein bharat ne bahut pragati ki hai."},
    {"id":"hi_11","text":"Spasht awaaz mein bolein taaki samajh mein aaye."},
    {"id":"hi_12","text":"Sthapit sanstha ne sthiti sudhaarne ke liye kadam uthaye."},
    {"id":"hi_13","text":"Aapka order number paanch char teen do ek hai."},
    {"id":"hi_14","text":"Yeh company baees hazaar karmodon mein kaam karti hai."},
    {"id":"hi_15","text":"Aaj paanch September do hazaar chhabbis hai."},
    {"id":"hi_16","text":"Kya aapne apna phone number confirm kar diya?"},
    {"id":"hi_17","text":"Aap kaun si bhasha mein baat karna chahte hain?"},
    {"id":"hi_18","text":"Aapki request process ho rahi hai, please wait karein."},
    {"id":"hi_19","text":"Zarax mein aapka swagat hai. Behtar seva ke liye ek dabayein."},
    {"id":"hi_20","text":"Subah ka waqt sabse accha hota hai kaam karne ke liye."},
]
EVAL_EN = [
    {"id":"en_01","text":"Hello, how are you today?"},
    {"id":"en_02","text":"Thank you for calling Zarax. How may I assist you?"},
    {"id":"en_03","text":"Please hold."},
    {"id":"en_04","text":"Your appointment has been confirmed for tomorrow at three PM."},
    {"id":"en_05","text":"We are working on improving our AI voice platform to support multiple Indian languages including Hindi and Hinglish."},
    {"id":"en_06","text":"Your order number is one two three four five six."},
    {"id":"en_07","text":"Can you help me find the nearest hospital?"},
    {"id":"en_08","text":"The meeting has been rescheduled to Friday morning."},
    {"id":"en_09","text":"First, please confirm your name. Then, provide your date of birth."},
    {"id":"en_10","text":"The quarterly earnings report demonstrates a fifteen percent increase in revenue."},
]


def log(msg):
    print(f"[G4-CONT {datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def tok2audio(toks, snac):
    import torch, numpy as np
    at = [t for t in toks if AUDIO_BASE <= t < AUDIO_HI]
    if len(at) < 7:
        return None, 0
    n = (len(at)//7)*7
    at = at[:n]
    c0, c1, c2 = [], [], []
    for i in range(0, n, 7):
        f = at[i:i+7]
        c0.append(f[0]-AUDIO_BASE-0*4096)
        c1.append(f[1]-AUDIO_BASE-1*4096)
        c2.append(f[2]-AUDIO_BASE-2*4096)
        c2.append(f[3]-AUDIO_BASE-3*4096)
        c1.append(f[4]-AUDIO_BASE-4*4096)
        c2.append(f[5]-AUDIO_BASE-5*4096)
        c2.append(f[6]-AUDIO_BASE-6*4096)
    t0 = torch.tensor(c0).clamp(0,4095).unsqueeze(0)
    t1 = torch.tensor(c1).clamp(0,4095).unsqueeze(0)
    t2 = torch.tensor(c2).clamp(0,4095).unsqueeze(0)
    with torch.no_grad():
        out = snac.decode([t0, t1, t2])
    return out.squeeze().numpy().astype("float32"), TARGET_SR


def make_seq(text_ids, audio_ids, max_len):
    import torch
    n = (min(max_len - len(text_ids) - 1, len(audio_ids)) // 7) * 7
    seq = text_ids + audio_ids[:n] + [EOS]
    assert seq[-1] == EOS, "EOS INVARIANT VIOLATED"
    inp = torch.tensor(seq, dtype=torch.long).unsqueeze(0)
    lbl = inp.clone()
    lbl[:, :len(text_ids)] = -100
    return inp, lbl


def audio2tok(audio_np, sr, snac):
    import torch, librosa
    if sr != TARGET_SR:
        audio_np = librosa.resample(audio_np.astype("float32"), orig_sr=sr, target_sr=TARGET_SR)
    dev = next(snac.parameters()).device
    at = torch.tensor(audio_np, dtype=torch.float32).unsqueeze(0).unsqueeze(0).to(dev)
    with torch.no_grad():
        codes = snac.encode(at)
    c0 = codes[0].squeeze().cpu().tolist()
    c1 = codes[1].squeeze().cpu().tolist()
    c2 = codes[2].squeeze().cpu().tolist()
    tokens = []
    for i in range(len(c0)):
        frame = [
            c0[i]+AUDIO_BASE+0*4096, c1[2*i]+AUDIO_BASE+1*4096,
            c2[4*i]+AUDIO_BASE+2*4096, c2[4*i+1]+AUDIO_BASE+3*4096,
            c1[2*i+1]+AUDIO_BASE+4*4096, c2[4*i+2]+AUDIO_BASE+5*4096,
            c2[4*i+3]+AUDIO_BASE+6*4096,
        ]
        if all(AUDIO_BASE <= t < AUDIO_HI for t in frame):
            tokens.extend(frame)
    return tokens


def evaluate(model, tokenizer, snac, whisper_model, device, label, audio_dir):
    import torch, soundfile as sf
    from jiwer import wer as jwer
    import unicodedata, re

    model.eval()
    if hasattr(model, 'config'):
        model.config.use_cache = True

    def norm(t):
        t = unicodedata.normalize("NFC", t.lower())
        return re.sub(r'\s+', ' ', re.sub(r'[^\w\s]', '', t)).strip()

    results = []
    for lang, sents in [("hindi", EVAL_HI), ("english", EVAL_EN)]:
        spk = SPEAKER if lang == "hindi" else "English (Female)"
        for s in sents:
            text, sid = s["text"], s["id"]
            prompt = f"<custom_token_3>{spk}: {STYLE} {text}<|eot_id|><custom_token_4>"
            inputs = tokenizer(prompt, return_tensors="pt").to(device)
            n_text = inputs.input_ids.shape[1]
            torch.manual_seed(42)
            torch.cuda.manual_seed(42)
            try:
                with torch.no_grad():
                    out = model.generate(
                        **inputs, max_new_tokens=1500,
                        do_sample=True, temperature=0.6, top_p=0.9,
                        repetition_penalty=1.1,
                        pad_token_id=tokenizer.eos_token_id,
                    )
                new_toks = out[0][n_text:].tolist()
            except Exception as e:
                results.append({"id": sid, "lang": lang, "text": text,
                                 "valid": False, "wer": None, "hypothesis": f"ERR:{e}",
                                 "has_eos": False, "audio_tokens": 0, "duration_s": 0})
                continue

            has_eos = EOS in new_toks
            audio_np, sr = tok2audio(new_toks, snac)
            wer_score, hyp, valid, dur = None, "", False, 0

            if audio_np is not None and len(audio_np) > 100:
                valid = True
                dur = len(audio_np) / sr
                fpath = os.path.join(audio_dir, f"{label}_{sid}.wav")
                sf.write(fpath, audio_np, sr)
                try:
                    wl = "hi" if lang == "hindi" else "en"
                    hyp = whisper_model.transcribe(fpath, language=wl)["text"].strip()
                    wer_score = round(jwer(norm(text), norm(hyp)), 3)
                except Exception:
                    pass

            results.append({
                "id": sid, "lang": lang, "text": text, "valid": valid,
                "has_eos": has_eos,
                "audio_tokens": len([t for t in new_toks if AUDIO_BASE <= t < AUDIO_HI]),
                "duration_s": round(dur, 2), "wer": wer_score, "hypothesis": hyp[:80],
            })

    hi_w = [r["wer"] for r in results if r["lang"] == "hindi" and r["wer"] is not None]
    en_w = [r["wer"] for r in results if r["lang"] == "english" and r["wer"] is not None]
    eos_n = sum(1 for r in results if r["has_eos"])
    inv = sum(1 for r in results if not r["valid"])
    emp = sum(1 for r in results if r["valid"] and r["audio_tokens"] < 7)
    garb = sum(1 for r in results if r["valid"] and r["wer"] is not None and r["wer"] > 2.0)

    hi_wer = round(sum(hi_w)/max(len(hi_w),1), 3) if hi_w else None
    en_wer = round(sum(en_w)/max(len(en_w),1), 3) if en_w else None

    return {
        "step": label, "hindi_wer": hi_wer, "english_wer": en_wer,
        "eos_count": eos_n, "eos_total": len(results),
        "invalid_count": inv, "empty_count": emp, "garbage_count": garb,
        "delta_hi_vs_base": round((hi_wer or 999) - 0.900, 3),
        "delta_en_vs_base": round((en_wer or 999) - 0.155, 3),
        "delta_hi_vs_2000": round((hi_wer or 999) - 0.943, 3),
        "delta_en_vs_2000": round((en_wer or 999) - 0.259, 3),
        "sentences": results,
    }


@app.function(
    gpu="L4",
    image=image,
    volumes={"/rnd": rnd_volume},
    secrets=[benchmark_secret, hf_secret],
    timeout=21600,
)
def run_continuation():
    import torch, whisper
    from transformers import AutoTokenizer, AutoModelForCausalLM
    from transformers import get_cosine_schedule_with_warmup
    from peft import PeftModel
    from datasets import load_dataset
    from snac import SNAC
    from torch.optim import AdamW
    import huggingface_hub, random

    for d in ["continuation/audio", "reports", "charts"]:
        os.makedirs(f"{BASE_DIR}/{d}", exist_ok=True)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    t_start = time.time()
    hf_token = os.environ.get("HF_TOKEN", "")
    if hf_token:
        huggingface_hub.login(token=hf_token, add_to_git_credential=False)

    log("=" * 60)
    log("G4-A STEP-2000 → STEP-5000 CONTINUATION (v3)")
    log("Checkpoint type: ADAPTER-ONLY — weight continuation")
    log(f"Start={START_STEP} Target={TARGET_STEP} Remaining={REMAINING}")
    log("=" * 60)

    # ── STEP 0: Verify START_GLOBAL_STEP == 2000 ──────────────────────────────
    if START_STEP != 2000:
        log(f"STOP: START_STEP={START_STEP} != 2000")
        return {"status": "BLOCKED", "error": "start_step_mismatch"}

    # ── STEP 1: Inspect checkpoint ────────────────────────────────────────────
    log("\n=== STEP 1: Checkpoint inspection ===")
    if not os.path.exists(STEP2000):
        log(f"STOP: {STEP2000} not found")
        return {"status": "BLOCKED", "error": "checkpoint_missing"}

    files = os.listdir(STEP2000)
    has_adapter = "adapter_model.safetensors" in files
    has_opt = "optimizer.pt" in files
    has_sched = "scheduler.pt" in files
    ckpt_type = "FULL_STATE" if (has_opt and has_sched) else "ADAPTER_ONLY"
    log(f"  Files: {files}")
    log(f"  Type: {ckpt_type} — weight continuation, not full-state resume")
    log(f"  optimizer.pt: {has_opt} | scheduler.pt: {has_sched}")

    if not has_adapter:
        log("STOP: adapter_model.safetensors missing")
        return {"status": "BLOCKED", "error": "adapter_missing"}

    ckpt_sha = sha256(os.path.join(STEP2000, "adapter_model.safetensors"))
    log(f"  SHA256: {ckpt_sha[:16]}...")

    # ── STEP 2: Load resources ────────────────────────────────────────────────
    log("\n=== STEP 2: Loading resources ===")
    tokenizer = AutoTokenizer.from_pretrained("kenpath/svara-tts-v1")
    snac = SNAC.from_pretrained("hubertsiuzdak/snac_24khz").eval().to("cpu")
    whisper_model = whisper.load_model("base")
    log("  Tokenizer + SNAC (CPU) + Whisper loaded")

    # ── STEP 3: Load model + adapter ─────────────────────────────────────────
    log("\n=== STEP 3: Load model + step_02000 adapter ===")
    base = AutoModelForCausalLM.from_pretrained(
        "kenpath/svara-tts-v1", torch_dtype=torch.bfloat16, device_map="cuda:0"
    )
    model = PeftModel.from_pretrained(base, STEP2000)

    # FIX: PeftModel.from_pretrained() sets all grads to False — re-enable LoRA
    enabled = 0
    for name, param in model.named_parameters():
        if 'lora_' in name:
            param.requires_grad = True
            enabled += 1
    log(f"  LoRA grads re-enabled: {enabled} parameters")

    vram = torch.cuda.memory_allocated() / 1e9
    log(f"  VRAM: {vram:.2f}GB")

    # Pre-flight inference test
    model.eval()
    model.config.use_cache = True
    test_prompt = f"<custom_token_3>{SPEAKER}: {STYLE} Namaste<|eot_id|><custom_token_4>"
    test_inp = tokenizer(test_prompt, return_tensors="pt").to(device)
    torch.manual_seed(42)
    with torch.no_grad():
        test_out = model.generate(**test_inp, max_new_tokens=50,
                                   do_sample=True, temperature=0.6,
                                   pad_token_id=tokenizer.eos_token_id)
    test_toks = test_out[0][test_inp.input_ids.shape[1]:].tolist()
    test_audio = [t for t in test_toks if AUDIO_BASE <= t < AUDIO_HI]
    test_eos = EOS in test_toks
    log(f"  Preflight: audio_tokens={len(test_audio)} eos={test_eos}")

    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    log(f"  Trainable params: {trainable:,}")
    if trainable == 0:
        log("STOP: trainable=0 after fix — unexpected failure")
        return {"status": "BLOCKED", "error": "trainable_zero"}

    # ── STEP 4: Dataset + speaker split ──────────────────────────────────────
    log("\n=== STEP 4: Dataset ===")
    ds = load_dataset("SPRINGLab/IndicVoices-R_Hindi", split="train")
    log(f"  {len(ds)} samples")

    speakers = {}
    for i in range(min(5000, len(ds))):
        try:
            spk = ds[i].get("speaker_id", str(i))
            dur = len(ds[i]["audio"]["array"]) / ds[i]["audio"]["sampling_rate"]
            if 0.5 < dur < 30:
                speakers[spk] = speakers.get(spk, 0) + 1
        except Exception:
            pass
    spk_list = sorted(speakers.keys())
    n_train = int(0.8 * len(spk_list))
    train_spk = set(spk_list[:n_train])
    log(f"  Train speakers: {len(train_spk)} | Val: {len(spk_list)-n_train}")

    # ── STEP 5: Pre-tokenize ──────────────────────────────────────────────────
    log(f"\n=== STEP 5: Pre-tokenize {REMAINING} batches ===")
    batches = []
    skipped = 0
    skip_r = {"audio_short": 0, "eos_fail": 0, "error": 0}
    t_tok = time.time()

    # Pre-filter by speaker first (fast — no SNAC for rejected)
    random.seed(2000)
    all_idx = list(range(len(ds)))
    random.shuffle(all_idx)

    train_idx = []
    for i in all_idx:
        try:
            spk = ds[i].get("speaker_id", str(i))
            if spk in train_spk:
                train_idx.append(i)
        except Exception:
            pass

    log(f"  Pre-filtered: {len(train_idx)} training-speaker samples")

    for idx in train_idx:
        if len(batches) >= REMAINING:
            break
        try:
            s = ds[idx]
            audio_np = s["audio"]["array"].astype("float32")
            sr = s["audio"]["sampling_rate"]
            text = s.get("text", "")
            if not text.strip():
                skipped += 1
                skip_r["error"] += 1
                continue
            prompt = f"<custom_token_3>{SPEAKER}: {STYLE} {text}<|eot_id|><custom_token_4>"
            text_ids = tokenizer.encode(prompt, add_special_tokens=False)
            audio_toks = audio2tok(audio_np, sr, snac)
            if len(audio_toks) < 7:
                skipped += 1
                skip_r["audio_short"] += 1
                continue
            inp, lbl = make_seq(text_ids, audio_toks, MAX_LEN)
            if inp[0][-1].item() != EOS:
                skipped += 1
                skip_r["eos_fail"] += 1
                continue
            if (lbl[0] != -100).sum().item() < 7:
                skipped += 1
                skip_r["error"] += 1
                continue
            batches.append((inp.cpu(), lbl.cpu()))
        except Exception as e:
            skipped += 1
            skip_r["error"] += 1
            if skipped <= 3:
                log(f"  SKIP: {str(e)[:60]}")

    tok_time = time.time() - t_tok
    log(f"  {len(batches)} batches in {tok_time:.1f}s (skipped {skipped}: {skip_r})")

    if not batches:
        return {"status": "BLOCKED", "error": "zero_batches"}

    # EOS invariant check
    inp0, lbl0 = batches[0]
    assert inp0[0][-1].item() == EOS, "EOS INVARIANT FAIL on first batch"
    log(f"  EOS invariant ✅ seq_len={inp0.shape[1]} loss_tokens={(lbl0[0]!=-100).sum().item()}")

    # ── STEP 6: Optimizer + scheduler ────────────────────────────────────────
    log("\n=== STEP 6: Optimizer setup ===")
    model.train()
    model.enable_input_require_grads()
    model.gradient_checkpointing_enable()

    optimizer = AdamW(
        [p for p in model.parameters() if p.requires_grad],
        lr=LR, weight_decay=0.01,
    )
    # Fix: set initial_lr before resuming scheduler at last_epoch=DONE_OPT
    for pg in optimizer.param_groups:
        pg['initial_lr'] = LR
    scheduler = get_cosine_schedule_with_warmup(
        optimizer,
        num_warmup_steps=WARMUP_ORIG,
        num_training_steps=TOTAL_OPT_ORIG,
        last_epoch=DONE_OPT,
    )
    lr_now = scheduler.get_last_lr()[0] if hasattr(scheduler, 'get_last_lr') else LR
    log(f"  LR at continuation: {lr_now:.2e} (expected ~3.50e-05)")

    # ── STEP 7: Training ──────────────────────────────────────────────────────
    log(f"\n=== STEP 7: Training {len(batches)} steps ===")
    log(f"  Global steps: {START_STEP+1} → {START_STEP+len(batches)}")
    log(f"  Checkpoints at: {[s for s in CKPT_STEPS if s <= START_STEP+len(batches)]}")

    losses = []
    eval_results = {}
    ckpt_manifest = []
    peak_vram = vram
    nan_count = 0
    oom_count = 0
    early_stop = None
    training_log = []
    optimizer.zero_grad()
    t_train = time.time()

    METRICS = f"{CONT_DIR}/metrics.csv"
    os.makedirs(CONT_DIR, exist_ok=True)

    for local_step, (inp, lbl) in enumerate(batches):
        global_step = START_STEP + local_step + 1

        try:
            out = model(input_ids=inp.to(device), labels=lbl.to(device))
            loss = out.loss / GRAD_ACCUM
            if torch.isnan(loss) or torch.isinf(loss):
                nan_count += 1
                log(f"  ⚠️ NaN/Inf at step {global_step}")
                optimizer.zero_grad()
                if nan_count > 10:
                    early_stop = "NaN_exceeded"
                    break
                continue
            loss.backward()
            losses.append(out.loss.item())
            if (local_step + 1) % GRAD_ACCUM == 0:
                torch.nn.utils.clip_grad_norm_(
                    [p for p in model.parameters() if p.requires_grad], 1.0)
                optimizer.step()
                scheduler.step()
                optimizer.zero_grad()
            peak_vram = max(peak_vram, torch.cuda.max_memory_allocated() / 1e9)
            if (local_step + 1) % 200 == 0:
                gc.collect()
                torch.cuda.empty_cache()
            if global_step % 50 == 0 or local_step == 0:
                avg10 = sum(losses[-10:]) / min(len(losses), 10)
                lr_c = scheduler.get_last_lr()[0] if hasattr(scheduler, 'get_last_lr') else LR
                elapsed = time.time() - t_train
                log(f"  global={global_step} loss={losses[-1]:.4f} avg={avg10:.4f} "
                    f"vram={peak_vram:.2f}GB lr={lr_c:.2e} elapsed={elapsed:.0f}s")
                training_log.append({"global_step": global_step, "loss": round(losses[-1], 4),
                                      "lr": lr_c, "peak_vram": round(peak_vram, 2)})

        except torch.cuda.OutOfMemoryError:
            oom_count += 1
            log(f"  OOM at step {global_step}")
            optimizer.zero_grad()
            gc.collect()
            torch.cuda.empty_cache()
            if oom_count > 3:
                early_stop = "OOM_exceeded"
                break

        # Checkpoint gate
        if global_step in CKPT_STEPS or global_step == START_STEP + len(batches):
            log(f"\n{'='*50}")
            log(f"CHECKPOINT: global step {global_step}")

            ckpt_path = os.path.join(CKPT_DIR, f"step_{global_step:05d}")
            os.makedirs(ckpt_path, exist_ok=True)
            model.save_pretrained(ckpt_path)
            ckpt_files = os.listdir(ckpt_path)
            ok = "adapter_model.safetensors" in ckpt_files
            ckpt_sha_c = sha256(os.path.join(ckpt_path, "adapter_model.safetensors")) if ok else "N/A"
            size_mb = sum(os.path.getsize(os.path.join(ckpt_path, f)) for f in ckpt_files) / 1e6
            log(f"  Saved: {'VALID' if ok else 'INVALID'} | {size_mb:.1f}MB | SHA={ckpt_sha_c[:12]}...")
            ckpt_manifest.append({"step": global_step, "path": ckpt_path,
                                   "integrity": "VALID" if ok else "INVALID",
                                   "size_mb": round(size_mb, 2), "sha": ckpt_sha_c[:16]})
            if not ok:
                early_stop = f"CORRUPT_CKPT_step_{global_step}"
                break

            # Evaluate
            adir = f"{CONT_DIR}/audio/step_{global_step:05d}"
            os.makedirs(adir, exist_ok=True)
            ev = evaluate(model, tokenizer, snac, whisper_model, device,
                          f"step_{global_step:05d}", adir)
            eval_results[f"step_{global_step:05d}"] = ev
            log(f"  hi_wer={ev['hindi_wer']} (Δbase={ev['delta_hi_vs_base']:+.3f} Δ2000={ev['delta_hi_vs_2000']:+.3f})")
            log(f"  en_wer={ev['english_wer']} (Δbase={ev['delta_en_vs_base']:+.3f} Δ2000={ev['delta_en_vs_2000']:+.3f})")
            log(f"  eos={ev['eos_count']}/{ev['eos_total']} invalid={ev['invalid_count']} empty={ev['empty_count']}")

            # CSV
            row = {"global_step": global_step,
                   "loss": round(losses[-1], 4) if losses else None,
                   "hindi_wer": ev["hindi_wer"], "english_wer": ev["english_wer"],
                   "eos_count": ev["eos_count"], "invalid": ev["invalid_count"],
                   "empty": ev["empty_count"], "peak_vram": round(peak_vram, 2),
                   "delta_hi_base": ev["delta_hi_vs_base"], "delta_en_base": ev["delta_en_vs_base"],
                   "delta_hi_2000": ev["delta_hi_vs_2000"], "delta_en_2000": ev["delta_en_vs_2000"]}
            wh = not os.path.exists(METRICS)
            with open(METRICS, "a", newline="") as f:
                w = csv.DictWriter(f, fieldnames=list(row.keys()))
                if wh:
                    w.writeheader()
                w.writerow(row)

            # Early stop guards
            if ev["hindi_wer"] is not None and ev["hindi_wer"] > 2.0:
                early_stop = f"SEVERE_HINDI_step_{global_step}"
                break
            if ev["english_wer"] is not None and ev["english_wer"] > 0.9:
                early_stop = f"SEVERE_ENGLISH_step_{global_step}"
                break

            model.train()
            if hasattr(model, 'config'):
                model.config.use_cache = False

    train_time = time.time() - t_train
    total_time = time.time() - t_start
    cost = round(total_time / 3600 * 0.80, 3)

    # Best checkpoint
    best_ck = None
    best_sc = None
    for k, ev in eval_results.items():
        hi = ev.get("hindi_wer") or 999
        en = ev.get("english_wer") or 999
        if hi < 2.0 and en < 0.8 and ev.get("invalid_count", 999) <= 5:
            sc = hi + (en - 0.155) * 0.5
            if best_sc is None or sc < best_sc:
                best_sc = sc
                best_ck = k

    # Verdict
    last_ev = None
    for k in reversed(list(eval_results.keys())):
        last_ev = eval_results[k]
        break

    hi_f = last_ev["hindi_wer"] if last_ev else None
    en_f = last_ev["english_wer"] if last_ev else None
    mandatory_done = all(f"step_{s:05d}" in eval_results for s in [3000, 4000, 5000])

    if early_stop:
        verdict = f"PARTIAL — {early_stop}"
    elif hi_f and en_f:
        if hi_f < 1.0 and en_f < 0.35:
            verdict = "PASS"
        elif hi_f < 1.5 and en_f < 0.5:
            verdict = "PASS WITH ENGLISH WARNING"
        else:
            verdict = "FAIL"
    else:
        verdict = "INCONCLUSIVE"

    if not mandatory_done:
        verdict = f"PARTIAL — mandatory checkpoints missing"

    # Comparison table
    table = []
    for name, bl in BASELINES.items():
        table.append({"exp": name, "hi_wer": bl["hi"], "en_wer": bl["en"], "status": "BASELINE"})
    for k, ev in sorted(eval_results.items()):
        s = int(k.split("_")[1])
        table.append({"exp": f"G4A@{s}", "hi_wer": ev["hindi_wer"],
                      "en_wer": ev["english_wer"], "eos": f"{ev['eos_count']}/{ev['eos_total']}",
                      "invalid": ev["invalid_count"], "status": verdict if s == 5000 else "OK"})

    final = {
        "phase": "7.2.G4-A-Continuation", "version": "v3",
        "verdict": verdict, "early_stop": early_stop,
        "checkpoint_type": "ADAPTER_ONLY — weight continuation",
        "start_step": START_STEP, "target_step": TARGET_STEP,
        "steps_completed": len(losses), "nan_count": nan_count, "oom_count": oom_count,
        "peak_vram_gb": round(peak_vram, 2), "train_time_s": round(train_time, 1),
        "total_time_s": round(total_time, 1), "cost_usd": cost,
        "best_checkpoint": best_ck, "mandatory_checkpoints_done": mandatory_done,
        "comparison_table": table,
        "eval_results": eval_results,
        "checkpoint_manifest": ckpt_manifest,
        "not_proven": ["Hindi MOS", "Same-voice identity", "Hinglish", "Emotion/style/pitch"],
        "g4b_decision": "DO NOT START — await explicit approval",
        "production_changes": "ZERO",
    }

    os.makedirs(f"{BASE_DIR}/reports", exist_ok=True)
    with open(f"{BASE_DIR}/reports/G4A_STEP5000_REPORT.json", "w") as f:
        json.dump(final, f, indent=2, ensure_ascii=False, default=str)

    log("\n" + "=" * 60)
    log("ZARAX G4-A FINAL STATUS")
    log("=" * 60)
    log(f"G4-A VERDICT: {verdict}")
    log(f"Hindi final: {hi_f} | English final: {en_f}")
    log(f"Best checkpoint: {best_ck}")
    log(f"EOS: {'PASS' if all(ev['eos_count']>0 for ev in eval_results.values()) else 'FAIL'}")
    log(f"OOM: {'PASS' if oom_count==0 else 'FAIL'}")
    log(f"Cost: ${cost}")
    log(f"Production: NONE | G4-B: DO NOT START")
    log("=" * 60)

    return final


@app.local_entrypoint()
def main():
    log("G4-A Step-2000→5000 v3 starting...")
    result = run_continuation.remote()
    print(json.dumps(result, indent=2, ensure_ascii=False, default=str))
    with open("phase72g4_continuation_report.json", "w") as f:
        json.dump(result, f, indent=2, ensure_ascii=False, default=str)
    log("Done.")
  
