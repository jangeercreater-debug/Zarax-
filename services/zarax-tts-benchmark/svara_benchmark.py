"""
Zarax Phase 7.1 — svara-TTS v1 Baseline Benchmark
EXPERIMENTAL — isolated from production.
"""

import modal

app = modal.App("zarax-svara-benchmark")
benchmark_volume = modal.Volume.from_name("zarax-benchmark-vol", create_if_missing=True)
benchmark_secret = modal.Secret.from_name("zarax-benchmark-secret")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "transformers>=4.46.0",
        "torch>=2.4.0",
        "torchaudio>=2.4.0",
        "snac>=1.2.1",
        "soundfile>=0.12.1",
        "numpy>=1.24.0",
        "openai-whisper>=20231117",
        "accelerate>=0.26.0",
        "sentencepiece>=0.2.0",
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

SVARA_SPEAKERS = {
    "english": "English (Female)", "hindi": "Hindi (Female)",
    "hindi_devanagari": "Hindi (Female)", "hinglish": "Hindi (Female)",
}
SVARA_STYLES = {
    "conversational": "<neutral>", "professional": "<formal>",
    "ivr": "<formal>", "casual": "<neutral>",
    "introduction": "<neutral>", "question": "<neutral>", "numbers": "<neutral>",
}


@app.cls(
    gpu="L4",
    image=image,
    volumes={"/benchmark": benchmark_volume},
    secrets=[benchmark_secret],
    scaledown_window=300,
    timeout=600,
)
class SvaraBenchmark:

    @modal.enter()
    def load(self):
        import os, logging, time, torch
        logging.basicConfig(level=logging.INFO)
        self.logger = logging.getLogger("svara-benchmark")
        os.makedirs("/benchmark/hf_cache", exist_ok=True)
        self.logger.info("Phase 7.1 — Loading svara-TTS v1 (Apache 2.0)...")
        t0 = time.time()
        try:
            from transformers import AutoTokenizer, AutoModelForCausalLM
            from snac import SNAC
            self.tokenizer = AutoTokenizer.from_pretrained("kenpath/svara-tts-v1")
            self.llm = AutoModelForCausalLM.from_pretrained(
                "kenpath/svara-tts-v1", device_map="cuda:0", torch_dtype=torch.float16,
            )
            self.llm.eval()
            self.snac = SNAC.from_pretrained("hubertsiuzdak/snac_24khz").eval().to("cuda:0")
            self.vram_load_gb = torch.cuda.memory_allocated() / 1e9
            self.load_time_s = time.time() - t0
            self.model_loaded = True
            self.logger.info(f"Loaded | {self.load_time_s:.1f}s | VRAM: {self.vram_load_gb:.2f}GB")
        except Exception as e:
            self.model_loaded = False
            self.load_error = str(e)
            self.logger.error(f"Load failed: {e}")

    def _auth(self, token: str) -> bool:
        import os
        exp = os.environ.get("ZARAX_BENCHMARK_TOKEN", "")
        return bool(exp) and token == exp

    def _tokens_to_audio(self, tokens: list) -> tuple:
        import torch, numpy as np
        OFF = 128266
        at = [t for t in tokens if t >= OFF]
        if not at: raise ValueError("No audio tokens")
        n = (len(at)//7)*7; at = at[:n]
        c0,c1,c2 = [],[],[]
        for i in range(0,n,7):
            c0.append(at[i]-OFF); c1.append(at[i+1]-OFF); c1.append(at[i+4]-OFF)
            c2.append(at[i+2]-OFF); c2.append(at[i+3]-OFF)
            c2.append(at[i+5]-OFF); c2.append(at[i+6]-OFF)
        dev = next(self.snac.parameters()).device
        t0=torch.tensor(c0,dtype=torch.long).unsqueeze(0).to(dev)
        t1=torch.tensor(c1,dtype=torch.long).unsqueeze(0).to(dev)
        t2=torch.tensor(c2,dtype=torch.long).unsqueeze(0).to(dev)
        with torch.no_grad(): audio = self.snac.decode([t0,t1,t2])
        return audio.squeeze().cpu().numpy().astype(np.float32), 24000

    def _synth(self, text: str, speaker_id: str, style_tag: str) -> dict:
        import io, time, torch, numpy as np, soundfile as sf, base64
        if not getattr(self, "model_loaded", False):
            return {"success": False, "error": "model_not_loaded", "text": text}
        torch.cuda.reset_peak_memory_stats(); t0 = time.time()
        try:
            prompt = f"<custom_token_3>{speaker_id}: {style_tag} {text}<|eot_id|><custom_token_4>"
            inputs = self.tokenizer(prompt, return_tensors="pt").to("cuda:0")
            with torch.no_grad():
                out = self.llm.generate(
                    **inputs, max_new_tokens=1500, do_sample=True,
                    temperature=0.6, top_p=0.9, repetition_penalty=1.1,
                    pad_token_id=self.tokenizer.eos_token_id,
                )
            new_tok = out[0][inputs.input_ids.shape[1]:].tolist()
            latency_s = time.time()-t0
            peak_vram_gb = torch.cuda.max_memory_allocated()/1e9
            audio_np, sr = self._tokens_to_audio(new_tok)
            duration_s = len(audio_np)/sr
            buf = io.BytesIO(); sf.write(buf, audio_np, sr, format="WAV", subtype="PCM_16")
            return {
                "success": True, "audio_b64": base64.b64encode(buf.getvalue()).decode(),
                "sample_rate": sr, "duration_s": round(duration_s,2),
                "latency_s": round(latency_s,2),
                "rtf": round(latency_s/max(duration_s,0.001),3),
                "peak_vram_gb": round(peak_vram_gb,2),
                "speaker_id": speaker_id, "style_tag": style_tag,
                "audio_tokens": len([t for t in new_tok if t>=128266]), "text": text,
            }
        except Exception as e:
            return {"success": False, "error": str(e), "text": text,
                    "latency_s": round(time.time()-t0,2)}

    def _wer(self, audio_b64: str, ref: str, lang: str) -> dict:
        try:
            import base64, tempfile, os, whisper
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp.write(base64.b64decode(audio_b64)); p = tmp.name
            wm = whisper.load_model("base")
            wl = "hi" if "hindi" in lang else "en"
            t = wm.transcribe(p, language=wl)["text"].strip(); os.unlink(p)
            r = ref.lower().split(); h = t.lower().split()
            m,n = len(r),len(h); dp = list(range(n+1))
            for i in range(1,m+1):
                nd=[i]+[0]*n
                for j in range(1,n+1):
                    nd[j]=dp[j-1] if r[i-1]==h[j-1] else 1+min(dp[j],nd[j-1],dp[j-1])
                dp=nd
            return {"wer": round(dp[n]/max(m,1),3), "transcript": t}
        except Exception as e:
            return {"wer": None, "error": str(e)}

    @modal.fastapi_endpoint(method="GET", label="svara-health")
    def health(self):
        return {
            "service": "zarax-svara-benchmark", "phase": "7.1",
            "status": "EXPERIMENTAL — isolated from production",
            "model": "kenpath/svara-tts-v1", "license": "Apache 2.0",
            "hindi_official": True,
            "model_loaded": getattr(self, "model_loaded", False),
            "vram_load_gb": round(getattr(self, "vram_load_gb", 0), 2),
            "load_time_s": round(getattr(self, "load_time_s", 0), 2),
            "load_error": getattr(self, "load_error", None),
        }

    @modal.fastapi_endpoint(method="POST", label="svara-synthesize")
    def synthesize(self, request: dict):
        from fastapi import HTTPException
        if not self._auth(request.get("token", "")):
            raise HTTPException(status_code=401)
        text = request.get("text", "").strip()
        lang = request.get("language", "english")
        if not text or len(text) > 500: raise HTTPException(status_code=400)
        speaker_id = SVARA_SPEAKERS.get(lang, "English (Female)")
        style_tag = SVARA_STYLES.get(request.get("category", "conversational"), "<neutral>")
        result = self._synth(text, speaker_id, style_tag)
        result["model"] = "kenpath/svara-tts-v1"
        return result

    @modal.fastapi_endpoint(method="POST", label="svara-full-benchmark")
    def run_full_benchmark(self, request: dict):
        from fastapi import HTTPException
        if not self._auth(request.get("token", "")):
            raise HTTPException(status_code=401)
        if not getattr(self, "model_loaded", False):
            raise HTTPException(status_code=503)
        run_wer = request.get("run_wer", True)
        results = []
        for s in BENCHMARK_SENTENCES:
            sp = SVARA_SPEAKERS.get(s["lang"], "English (Female)")
            st = SVARA_STYLES.get(s["cat"], "<neutral>")
            r = self._synth(s["text"], sp, st)
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
        } for l,st in by_lang.items()}
        return {
            "phase": "7.1", "model": "kenpath/svara-tts-v1",
            "license": "Apache 2.0", "hindi_official": True, "gpu": "L4",
            "model_load_time_s": round(getattr(self, "load_time_s", 0), 2),
            "vram_load_gb": round(getattr(self, "vram_load_gb", 0), 2),
            "total": len(results), "successful": len(successful),
            "summary_by_language": summary,
            "mos": "UNTESTED — requires human listening",
            "speaker_similarity": "UNTESTED",
            "results": results,
            "production_impact": "ZERO",
        }
