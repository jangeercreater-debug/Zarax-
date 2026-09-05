"""
Zarax Phase 7.1 — Qwen3-TTS Baseline Benchmark
EXPERIMENTAL — isolated from production.
"""

import modal

app = modal.App("zarax-qwen3-benchmark")
benchmark_volume = modal.Volume.from_name("zarax-benchmark-vol", create_if_missing=True)
benchmark_secret = modal.Secret.from_name("zarax-benchmark-secret")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "qwen-tts>=0.1.0",
        "torch>=2.4.0",
        "soundfile>=0.12.1",
        "numpy>=1.24.0",
        "openai-whisper>=20231117",
        "fastapi[standard]>=0.111.0",
    )
    .env({"HF_HOME": "/benchmark/hf_cache"})
)

BENCHMARK_SENTENCES = [
    {"id": "en_01", "lang": "english",          "cat": "conversational", "text": "Hello, how are you today?"},
    {"id": "en_02", "lang": "english",          "cat": "introduction",   "text": "My name is Zarax. I am your AI assistant."},
    {"id": "en_03", "lang": "english",          "cat": "professional",   "text": "Please confirm your appointment for tomorrow at three PM."},
    {"id": "en_04", "lang": "english",          "cat": "numbers",        "text": "The quarterly report shows a fifteen percent increase."},
    {"id": "en_05", "lang": "english",          "cat": "question",       "text": "Can you help me find the nearest hospital?"},
    {"id": "en_06", "lang": "english",          "cat": "numbers",        "text": "Your order number is one two three four five six."},
    {"id": "en_07", "lang": "english",          "cat": "professional",   "text": "Thank you for calling. We value your business."},
    {"id": "en_08", "lang": "english",          "cat": "professional",   "text": "The meeting has been rescheduled to Friday morning."},
    {"id": "en_09", "lang": "english",          "cat": "conversational", "text": "I will be happy to assist you with your query."},
    {"id": "en_10", "lang": "english",          "cat": "ivr",            "text": "Press one for English, two for Hindi support."},
    {"id": "hi_01", "lang": "hindi",            "cat": "conversational", "text": "Namaste, aap kaise hain aaj?"},
    {"id": "hi_02", "lang": "hindi",            "cat": "introduction",   "text": "Mera naam Zarax hai. Main aapka AI assistant hoon."},
    {"id": "hi_03", "lang": "hindi",            "cat": "professional",   "text": "Kal ki appointment confirm kar dijiye, teen baje."},
    {"id": "hi_04", "lang": "hindi",            "cat": "question",       "text": "Kripya apna phone number bataiye."},
    {"id": "hi_05", "lang": "hindi",            "cat": "professional",   "text": "Aapki request process ho rahi hai."},
    {"id": "hi_06", "lang": "hindi",            "cat": "conversational", "text": "Dhanyavad. Aapka din mangalmay ho."},
    {"id": "hi_07", "lang": "hindi",            "cat": "question",       "text": "Kya main kuch aur madad kar sakta hoon?"},
    {"id": "hi_08", "lang": "hindi",            "cat": "numbers",        "text": "Aapka order number hai do char six aath."},
    {"id": "hi_09", "lang": "hindi",            "cat": "professional",   "text": "Meeting kal subah dus baje hai."},
    {"id": "hi_10", "lang": "hindi",            "cat": "ivr",            "text": "Ek dabao Hindi ke liye, do dabao English ke liye."},
    {"id": "hi_d1", "lang": "hindi_devanagari", "cat": "conversational", "text": "नमस्ते, आप कैसे हैं आज?"},
    {"id": "hi_d2", "lang": "hindi_devanagari", "cat": "introduction",   "text": "मेरा नाम ज़ारैक्स है। मैं आपका AI असिस्टेंट हूँ।"},
    {"id": "hi_d3", "lang": "hindi_devanagari", "cat": "question",       "text": "क्या मैं आपकी कुछ और मदद कर सकता हूँ?"},
    {"id": "hg_01", "lang": "hinglish",         "cat": "casual",         "text": "Hello bro, aaj market ka kya scene hai?"},
    {"id": "hg_02", "lang": "hinglish",         "cat": "professional",   "text": "Namaste! Aapka account balance check karna hai kya?"},
    {"id": "hg_03", "lang": "hinglish",         "cat": "ivr",            "text": "Please hold karo, main abhi connect karta hoon."},
    {"id": "hg_04", "lang": "hinglish",         "cat": "professional",   "text": "Aapki call important hai, please wait karo."},
    {"id": "hg_05", "lang": "hinglish",         "cat": "conversational", "text": "Sorry yaar, ek minute mein aapko callback milega."},
]


@app.cls(
    gpu="T4",
    image=image,
    volumes={"/benchmark": benchmark_volume},
    secrets=[benchmark_secret],
    scaledown_window=300,
    timeout=600,
)
class Qwen3Benchmark:

    @modal.enter()
    def load(self):
        import os, logging, time, torch
        logging.basicConfig(level=logging.INFO)
        self.logger = logging.getLogger("qwen3-benchmark")
        os.makedirs("/benchmark/hf_cache", exist_ok=True)
        self.logger.info("Loading Qwen3-TTS-12Hz-1.7B-Base (Apache 2.0)...")
        t0 = time.time()
        try:
            import flash_attn  # noqa
            attn = "flash_attention_2"
            self.has_fa2 = True
        except ImportError:
            attn = "sdpa"
            self.has_fa2 = False
        try:
            from qwen_tts import Qwen3TTSModel
            self.model = Qwen3TTSModel.from_pretrained(
                "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
                device_map="cuda:0",
                dtype=torch.bfloat16,
                attn_implementation=attn,
            )
            self.vram_load_gb = torch.cuda.memory_allocated() / 1e9
            self.load_time_s = time.time() - t0
            self.model_loaded = True
            self.model_methods = [m for m in dir(self.model) if not m.startswith('_')]
            self.logger.info(f"Loaded | {self.load_time_s:.1f}s | VRAM: {self.vram_load_gb:.2f}GB")
            self.logger.info(f"Methods: {self.model_methods}")
        except Exception as e:
            self.model_loaded = False
            self.load_error = str(e)
            self.model_methods = []
            self.logger.error(f"Load failed: {e}")

    def _auth(self, token: str) -> bool:
        import os
        exp = os.environ.get("ZARAX_BENCHMARK_TOKEN", "")
        return bool(exp) and token == exp

    def _synth(self, text: str, ref_b64: str | None = None) -> dict:
        import base64, io, time, torch, numpy as np
        import soundfile as sf
        if not getattr(self, "model_loaded", False):
            return {"success": False, "error": "model_not_loaded", "text": text}
        torch.cuda.reset_peak_memory_stats()
        t0 = time.time()
        try:
            m = self.model
            if ref_b64:
                import tempfile, os
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                    tmp.write(base64.b64decode(ref_b64))
                    ref_path = tmp.name
                wavs, sr = m.generate_voice_clone(text=text, reference_audio=ref_path)
                try: os.unlink(ref_path)
                except: pass
                mode = "voice_clone"
            else:
                # qwen-tts uses generate_defaults for standard TTS
                if hasattr(m, 'generate_defaults'):
                    result = m.generate_defaults(text=text)
                    # generate_defaults returns dict with audio data
                    if isinstance(result, dict):
                        self.logger.info(f"generate_defaults keys: {list(result.keys())}")
                        # Try common key names for audio output
                        if 'audio' in result:
                            wavs = result['audio']
                            sr = result.get('sample_rate', result.get('sr', 24000))
                        elif 'waveform' in result:
                            wavs = result['waveform']
                            sr = result.get('sample_rate', 24000)
                        elif 'wav' in result:
                            wavs = result['wav']
                            sr = result.get('sample_rate', 24000)
                        else:
                            raise ValueError(f"Unknown generate_defaults output keys: {list(result.keys())}")
                    else:
                        wavs, sr = result
                elif hasattr(m, 'generate_custom_voice'):
                    wavs, sr = m.generate_custom_voice(text=text)
                elif hasattr(m, 'generate_voice_design'):
                    wavs, sr = m.generate_voice_design(text=text)
                else:
                    raise AttributeError(f"No synthesis method. Available: {self.model_methods}")
                mode = "standard_tts"

            latency_s = time.time() - t0
            peak_vram_gb = torch.cuda.max_memory_allocated() / 1e9
            audio_np = wavs[0] if isinstance(wavs, list) else wavs
            if hasattr(audio_np, "cpu"): audio_np = audio_np.cpu().numpy()
            audio_np = np.squeeze(audio_np).astype(np.float32)
            duration_s = len(audio_np) / sr
            buf = io.BytesIO()
            sf.write(buf, audio_np, sr, format="WAV", subtype="PCM_16")
            return {
                "success": True,
                "audio_b64": base64.b64encode(buf.getvalue()).decode(),
                "sample_rate": sr, "duration_s": round(duration_s, 2),
                "latency_s": round(latency_s, 2),
                "rtf": round(latency_s / max(duration_s, 0.001), 3),
                "peak_vram_gb": round(peak_vram_gb, 2),
                "flash_attention_2": self.has_fa2,
                "mode": mode, "text": text,
                "model_methods": self.model_methods,
            }
        except Exception as e:
            return {
                "success": False, "error": str(e), "text": text,
                "model_methods": getattr(self, "model_methods", []),
            }

    def _wer(self, audio_b64: str, ref: str, lang: str) -> dict:
        try:
            import base64, tempfile, os, whisper
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp.write(base64.b64decode(audio_b64)); p = tmp.name
            wm = whisper.load_model("base")
            wl = "hi" if "hindi" in lang else "en"
            t = wm.transcribe(p, language=wl)["text"].strip()
            os.unlink(p)
            r = ref.lower().split(); h = t.lower().split()
            m, n = len(r), len(h); dp = list(range(n + 1))
            for i in range(1, m + 1):
                nd = [i] + [0] * n
                for j in range(1, n + 1):
                    nd[j] = dp[j-1] if r[i-1]==h[j-1] else 1+min(dp[j],nd[j-1],dp[j-1])
                dp = nd
            return {"wer": round(dp[n]/max(m,1), 3), "transcript": t}
        except Exception as e:
            return {"wer": None, "error": str(e)}

    @modal.fastapi_endpoint(method="GET", label="qwen3-health")
    def health(self):
        return {
            "service": "zarax-qwen3-benchmark", "phase": "7.1",
            "status": "EXPERIMENTAL — isolated from production",
            "model": "Qwen3-TTS-12Hz-1.7B-Base", "license": "Apache 2.0",
            "hindi_official": False,
            "model_loaded": getattr(self, "model_loaded", False),
            "flash_attention_2": getattr(self, "has_fa2", False),
            "vram_load_gb": round(getattr(self, "vram_load_gb", 0), 2),
            "load_time_s": round(getattr(self, "load_time_s", 0), 2),
            "load_error": getattr(self, "load_error", None),
            "model_methods": getattr(self, "model_methods", []),
        }

    @modal.fastapi_endpoint(method="POST", label="qwen3-synthesize")
    def synthesize(self, request: dict):
        from fastapi import HTTPException
        if not self._auth(request.get("token", "")):
            raise HTTPException(status_code=401)
        text = request.get("text", "").strip()
        if not text or len(text) > 500:
            raise HTTPException(status_code=400)
        result = self._synth(text, request.get("reference_audio_b64"))
        result["model"] = "Qwen3-TTS-12Hz-1.7B-Base"
        result["note"] = "Hindi NOT officially supported."
        return result

    @modal.fastapi_endpoint(method="POST", label="qwen3-full-benchmark")
    def run_full_benchmark(self, request: dict):
        from fastapi import HTTPException
        if not self._auth(request.get("token", "")):
            raise HTTPException(status_code=401)
        if not getattr(self, "model_loaded", False):
            raise HTTPException(status_code=503)
        run_wer = request.get("run_wer", True)
        results = []
        for s in BENCHMARK_SENTENCES:
            r = self._synth(s["text"])
            entry = {"id": s["id"], "lang": s["lang"], "cat": s["cat"], "text": s["text"], **r}
            if run_wer and r.get("success") and r.get("audio_b64"):
                entry["wer_result"] = self._wer(r["audio_b64"], s["text"], s["lang"])
            results.append(entry)
        successful = [r for r in results if r.get("success")]
        by_lang: dict = {}
        for r in results:
            l = r["lang"]
            if l not in by_lang: by_lang[l] = {"total":0,"success":0,"lat":[],"wers":[]}
            by_lang[l]["total"] += 1
            if r.get("success"):
                by_lang[l]["success"] += 1
                if r.get("latency_s"): by_lang[l]["lat"].append(r["latency_s"])
                wer = r.get("wer_result",{}).get("wer")
                if wer is not None: by_lang[l]["wers"].append(wer)
        summary = {l: {
            "success_rate": f"{st['success']}/{st['total']}",
            "avg_latency_s": round(sum(st["lat"])/max(len(st["lat"]),1),2),
            "avg_wer": round(sum(st["wers"])/max(len(st["wers"]),1),3) if st["wers"] else "UNTESTED",
        } for l, st in by_lang.items()}
        return {
            "phase": "7.1", "model": "Qwen3-TTS-12Hz-1.7B-Base",
            "license": "Apache 2.0", "hindi_official": False, "gpu": "T4",
            "flash_attention_2": getattr(self, "has_fa2", False),
            "model_load_time_s": round(getattr(self, "load_time_s", 0), 2),
            "vram_load_gb": round(getattr(self, "vram_load_gb", 0), 2),
            "model_methods": getattr(self, "model_methods", []),
            "total": len(results), "successful": len(successful),
            "summary_by_language": summary,
            "mos": "UNTESTED — requires human listening",
            "speaker_similarity": "UNTESTED",
            "results": results,
            "production_impact": "ZERO",
          }
