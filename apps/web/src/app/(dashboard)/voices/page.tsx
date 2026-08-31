"use client";
import { useEffect, useRef, useState } from "react";
import {
  Mic, Search, Play, Plus, Trash2, Edit2, Check,
  Globe, Sparkles, Volume2, Loader2, Wand2, Save,
  Star, Filter, X, Copy, AlertCircle, CheckCircle2,
  Upload, Shield, Zap, Info
} from "lucide-react";

interface Voice {
  id: string; name: string; description: string | null;
  voiceType: string; gender: string; language: string;
  languages: string[]; accent: string | null; style: string | null;
  provider: string | null; providerVoiceId: string | null;
  status: string; isPublic: boolean; isDefault: boolean;
  metadata: Record<string, unknown> | null;
}

interface VoiceCapability {
  supported: 'REAL' | 'PARTIAL' | 'SPEC_ONLY' | 'UNSUPPORTED' | 'GPU_REQUIRED';
  description: string;
  range?: { min: number; max: number };
  values?: string[];
}

interface VoiceCapabilities {
  voiceId: string; provider: string; model: string;
  realCapabilities: string[];
  capabilities: Record<string, VoiceCapability>;
  languages: string[];
  gpuRequiredFor: string[];
  honestSummary: string;
}

interface VoiceCandidate {
  candidateId: string; name: string; description: string;
  providerVoiceId: string; previewText: string; rank: number;
  profile: { gender: string; ageStyle: string; accent: string; tone: string;
    personality: string; speakingStyle: string; speed: number;
    energy: number; languages: string[]; tags: string[]; };
}

interface DesignResult {
  requestId: string; prompt: string;
  profile: VoiceCandidate["profile"]; candidates: VoiceCandidate[];
}

interface CloneInfo {
  consentStatement: string; consentVersion: string;
  model: string; modelVersion: string; license: string;
  synthesisAvailable: boolean; synthesisUnavailableMessage: string;
  audioLimits: { maxSizeMB: number; minDurationS: number; maxDurationS: number; acceptedFormats: string[]; };
}

interface CloneProfile {
  id: string; name: string; description: string | null;
  status: string; audioMimeType: string; audioDurationS: number;
  audioSizeBytes: number; synthesisAvail: boolean;
  synthesisStatus: string; cloningModel: string | null;
  failureReason: string | null; voiceId: string | null;
  createdAt: string; updatedAt: string;
}

const TYPE_COLORS: Record<string, string> = {
  SYSTEM: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  CUSTOM: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  GENERATED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  CLONED: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  MARKETPLACE: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
};

const GENDER_ICON: Record<string, string> = { FEMALE: "♀", MALE: "♂", NEUTRAL: "◈" };
const CLONE_STATUS_COLOR: Record<string, string> = {
  PROFILE_READY: "text-green-600", SYNTHESIS_UNAVAILABLE: "text-amber-600",
  FAILED: "text-red-600", PROCESSING: "text-blue-600",
  VALIDATING: "text-blue-600", INACTIVE: "text-gray-400",
};

const CAPABILITY_BADGE: Record<string, string> = {
  REAL: "bg-green-100 text-green-700",
  PARTIAL: "bg-yellow-100 text-yellow-700",
  SPEC_ONLY: "bg-blue-100 text-blue-700",
  GPU_REQUIRED: "bg-purple-100 text-purple-700",
  UNSUPPORTED: "bg-gray-100 text-gray-500",
};

const LANGUAGES = [
  { code: "", label: "Auto" },
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "hinglish", label: "Hinglish" },
  { code: "en-GB", label: "English (UK)" },
];

const PREVIEW_TEXTS: Record<string, string> = {
  "": "Hello! I am Zarax. How can I help you today?",
  en: "Hello! I am Zarax. How can I help you today?",
  hi: "Namaste! Main Zarax hoon. Aapki kaise madad kar sakti hoon?",
  hinglish: "Namaste! Main Zarax hoon. Bataiye, main aapki kaise help kar sakti hoon?",
  "en-GB": "Hello! I am Zarax. How may I assist you today?",
};

type Tab = "library" | "design" | "clone";

export default function VoicesPage() {
  const [tab, setTab] = useState<Tab>("library");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [genderFilter, setGenderFilter] = useState("");
  const [langFilter, setLangFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Phase 5: expression controls per voice
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<VoiceCapabilities | null>(null);
  const [previewText, setPreviewText] = useState("");
  const [previewLang, setPreviewLang] = useState("");
  const [previewSpeed, setPreviewSpeed] = useState(1.0);
  const [showExpression, setShowExpression] = useState(false);

  // Design state
  const [designPrompt, setDesignPrompt] = useState("");
  const [designing, setDesigning] = useState(false);
  const [designResult, setDesignResult] = useState<DesignResult | null>(null);
  const [designError, setDesignError] = useState<string | null>(null);
  const [previewingCandidate, setPreviewingCandidate] = useState<string | null>(null);
  const [savingCandidate, setSavingCandidate] = useState<string | null>(null);
  const [savedCandidates, setSavedCandidates] = useState<Set<string>>(new Set());

  // Clone state
  const [cloneInfo, setCloneInfo] = useState<CloneInfo | null>(null);
  const [cloneProfiles, setCloneProfiles] = useState<CloneProfile[]>([]);
  const [cloneName, setCloneName] = useState("");
  const [cloneDesc, setCloneDesc] = useState("");
  const [cloneAudioFile, setCloneAudioFile] = useState<File | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [selfVoiceChecked, setSelfVoiceChecked] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [cloneSuccess, setCloneSuccess] = useState<CloneProfile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (genderFilter) params.set("gender", genderFilter);
    if (langFilter) params.set("language", langFilter);
    if (typeFilter) params.set("voiceType", typeFilter);
    fetch("/api/voices?" + params.toString(), { credentials: "include" })
      .then(r => r.json()).then(j => { setVoices((j.data ?? []) as Voice[]); setLoading(false); })
      .catch(() => setLoading(false));
  };

  const loadCapabilities = async (voiceId: string) => {
    try {
      const res = await fetch(`/api/voices/${voiceId}/capabilities`, { credentials: "include" });
      const j = await res.json() as { data?: VoiceCapabilities };
      setCapabilities(j.data ?? null);
    } catch { setCapabilities(null); }
  };

  const loadCloneInfo = () => {
    fetch("/api/voices/clone/info", { credentials: "include" })
      .then(r => r.json()).then(j => setCloneInfo((j.data ?? null) as CloneInfo | null))
      .catch(() => undefined);
  };

  const loadCloneProfiles = () => {
    fetch("/api/voices/clone", { credentials: "include" })
      .then(r => r.json()).then(j => setCloneProfiles((j.data ?? []) as CloneProfile[]))
      .catch(() => undefined);
  };

  useEffect(() => { if (tab === "library") load(); }, [search, genderFilter, langFilter, typeFilter, tab]);
  useEffect(() => { if (tab === "clone" && !cloneInfo) { loadCloneInfo(); loadCloneProfiles(); } }, [tab]);

  const handleVoiceSelect = async (voice: Voice) => {
    if (selectedVoiceId === voice.id) {
      setSelectedVoiceId(null); setCapabilities(null); setShowExpression(false);
      return;
    }
    setSelectedVoiceId(voice.id);
    setShowExpression(true);
    setPreviewText(PREVIEW_TEXTS[voice.language] ?? PREVIEW_TEXTS.en);
    setPreviewLang(voice.language ?? "");
    setPreviewSpeed(1.0);
    await loadCapabilities(voice.id);
  };

  const handlePreview = async (voice: Voice, customText?: string, speed?: number, lang?: string) => {
    if (!voice.providerVoiceId) { setPreviewError("No provider ID — preview unavailable."); return; }
    setPreviewing(voice.id); setPreviewError(null);
    try {
      const sampleText = customText ?? PREVIEW_TEXTS[voice.language] ?? PREVIEW_TEXTS.en;
      const res = await fetch(`/api/voices/${voice.id}/preview`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sampleText,
          speed: speed ?? 1.0,
          language: lang || voice.language || "en",
        }),
      });
      if (!res.ok) { setPreviewError("Preview failed."); return; }
      const blob = await res.blob(); const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => { URL.revokeObjectURL(url); setPreviewing(null); };
      audio.onerror = () => { URL.revokeObjectURL(url); setPreviewing(null); };
      await audio.play();
    } catch { setPreviewError("Preview request failed."); } finally { setPreviewing(null); }
  };

  const handleDelete = async (voice: Voice) => {
    if (!confirm(`Deactivate "${voice.name}"?`)) return;
    await fetch(`/api/voices/${voice.id}`, { method: "DELETE", credentials: "include" });
    setVoices(v => v.filter(x => x.id !== voice.id));
  };

  const handleDesign = async () => {
    if (designPrompt.trim().length < 10) { setDesignError("Prompt must be at least 10 characters."); return; }
    setDesigning(true); setDesignResult(null); setDesignError(null);
    try {
      const res = await fetch("/api/voices/design", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ prompt: designPrompt }),
      });
      const j = await res.json() as { data?: DesignResult; message?: string };
      if (!res.ok) { setDesignError(j.message ?? "Design failed."); return; }
      setDesignResult(j.data ?? null);
    } catch { setDesignError("Design request failed."); } finally { setDesigning(false); }
  };

  const handlePreviewCandidate = async (candidate: VoiceCandidate) => {
    setPreviewingCandidate(candidate.candidateId); setPreviewError(null);
    try {
      const res = await fetch("/api/voices/design/preview", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ providerVoiceId: candidate.providerVoiceId, sampleText: candidate.previewText }),
      });
      if (!res.ok) { setPreviewError("Preview failed."); return; }
      const blob = await res.blob(); const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => { URL.revokeObjectURL(url); setPreviewingCandidate(null); };
      audio.onerror = () => { URL.revokeObjectURL(url); setPreviewingCandidate(null); };
      await audio.play();
    } catch { setPreviewError("Preview failed."); } finally { setPreviewingCandidate(null); }
  };

  const handleSaveCandidate = async (candidate: VoiceCandidate) => {
    if (!designResult) return;
    setSavingCandidate(candidate.candidateId);
    try {
      const res = await fetch("/api/voices/design/save", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: candidate.name, description: candidate.description, providerVoiceId: candidate.providerVoiceId, profile: candidate.profile }),
      });
      if (res.ok) { setSavedCandidates(s => new Set([...s, candidate.candidateId])); load(); }
    } finally { setSavingCandidate(null); }
  };

  const handleCloneSubmit = async () => {
    if (!cloneName.trim()) { setCloneError("Name is required."); return; }
    if (!cloneAudioFile) { setCloneError("Please select an audio file."); return; }
    if (!consentChecked || !selfVoiceChecked) { setCloneError("You must confirm both consent statements."); return; }
    if (!cloneInfo) { setCloneError("Clone info not loaded."); return; }
    setCloning(true); setCloneError(null); setCloneSuccess(null);
    try {
      const audioBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(cloneAudioFile);
      });
      const res = await fetch("/api/voices/clone", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: cloneName, description: cloneDesc || undefined,
          audioBase64, audioMimeType: cloneAudioFile.type || "audio/wav",
          consentText: cloneInfo.consentStatement,
          consentVersion: cloneInfo.consentVersion,
          consentedAt: new Date().toISOString(),
          isSelfVoice: selfVoiceChecked, language: "en",
        }),
      });
      const j = await res.json() as { data?: CloneProfile; message?: string; cloneErrorCode?: string };
      if (!res.ok) { setCloneError(j.message ?? j.cloneErrorCode ?? "Clone initiation failed."); return; }
      setCloneSuccess(j.data ?? null);
      setCloneName(""); setCloneDesc(""); setCloneAudioFile(null);
      setConsentChecked(false); setSelfVoiceChecked(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      loadCloneProfiles();
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : "Clone request failed.");
    } finally { setCloning(false); }
  };

  const handleDeleteClone = async (id: string, name: string) => {
    if (!confirm(`Delete voice clone "${name}"? Audio data will be permanently cleared.`)) return;
    await fetch(`/api/voices/clone/${id}`, { method: "DELETE", credentials: "include" });
    setCloneProfiles(p => p.filter(x => x.id !== id));
  };

  const capBadge = (level: string) => (
    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${CAPABILITY_BADGE[level] ?? "bg-gray-100 text-gray-500"}`}>
      {level.replace(/_/g, " ")}
    </span>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Mic className="h-6 w-6 text-primary" /> Voice Library
          </h1>
          <p className="text-sm text-muted-foreground">Zarax voices powered by Kokoro-82M (Apache 2.0)</p>
        </div>
      </div>

      <div className="flex gap-1 border-b">
        {[
          { id: "library" as Tab, label: "Library", icon: Volume2 },
          { id: "design" as Tab, label: "Voice Design", icon: Wand2 },
          { id: "clone" as Tab, label: "Voice Clone", icon: Copy },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <t.icon className="h-4 w-4" />{t.label}
          </button>
        ))}
      </div>

      {/* ── LIBRARY TAB ── */}
      {tab === "library" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input placeholder="Search voices..." value={search} onChange={e => setSearch(e.target.value)}
                className="flex h-10 w-full rounded-md border bg-background pl-9 pr-3 py-2 text-sm" />
            </div>
            <button onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${showFilters ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
              <Filter className="h-4 w-4" /> Filters
            </button>
          </div>

          {showFilters && (
            <div className="flex flex-wrap gap-2 p-4 rounded-lg border bg-muted/30">
              {[
                { value: genderFilter, set: setGenderFilter, opts: [["", "All genders"], ["FEMALE", "Female"], ["MALE", "Male"], ["NEUTRAL", "Neutral"]] },
                { value: langFilter, set: setLangFilter, opts: [["", "All languages"], ["en", "English"], ["hi", "Hindi"]] },
                { value: typeFilter, set: setTypeFilter, opts: [["", "All types"], ["SYSTEM", "System"], ["CUSTOM", "Custom"], ["CLONED", "Cloned"]] },
              ].map((f, i) => (
                <select key={i} value={f.value} onChange={e => f.set(e.target.value)}
                  className="rounded-md border bg-background px-3 py-1.5 text-sm">
                  {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              ))}
              {(genderFilter || langFilter || typeFilter) && (
                <button onClick={() => { setGenderFilter(""); setLangFilter(""); setTypeFilter(""); }}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" /> Clear
                </button>
              )}
            </div>
          )}

          {previewError && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-700">{previewError}</div>
          )}

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1,2,3,4].map(i => <div key={i} className="h-48 rounded-xl border bg-card animate-pulse" />)}
            </div>
          ) : voices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Volume2 className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-sm text-muted-foreground">No voices found.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {voices.map(voice => (
                <div key={voice.id}
                  className={`rounded-xl border bg-card p-5 space-y-3 hover:shadow-md transition-shadow cursor-pointer
                    ${voice.isDefault ? "border-primary/30 ring-1 ring-primary/20" : ""}
                    ${selectedVoiceId === voice.id ? "border-primary ring-2 ring-primary/30" : ""}`}
                  onClick={() => handleVoiceSelect(voice)}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{GENDER_ICON[voice.gender] ?? "◈"}</span>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold">{voice.name}</p>
                          {voice.isDefault && <Check className="h-3.5 w-3.5 text-primary" />}
                        </div>
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${TYPE_COLORS[voice.voiceType] ?? "bg-gray-100 text-gray-700"}`}>
                          {voice.voiceType}
                        </span>
                      </div>
                    </div>
                    {voice.provider === 'zarax' && (
                      <span className="text-xs bg-violet-100 text-violet-700 dark:bg-violet-900/30 px-1.5 py-0.5 rounded-full font-medium">Zarax TTS</span>
                    )}
                  </div>
                  {voice.description && <p className="text-xs text-muted-foreground line-clamp-2">{voice.description}</p>}
                  <div className="flex flex-wrap gap-1">
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Globe className="h-3 w-3" />{voice.language.toUpperCase()}</span>
                    {voice.style && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Sparkles className="h-3 w-3" />{voice.style}</span>}
                    {voice.accent && <span className="text-xs text-muted-foreground">· {voice.accent}</span>}
                  </div>
                  <div className="flex items-center gap-2 pt-1" onClick={e => e.stopPropagation()}>
                    <button onClick={() => handlePreview(voice)} disabled={previewing === voice.id}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
                      {previewing === voice.id ? <><Loader2 className="h-3 w-3 animate-spin" /> Playing...</> : <><Play className="h-3 w-3" /> Preview</>}
                    </button>
                    {!voice.isPublic && (
                      <>
                        <button className="rounded-md border p-1.5 hover:bg-muted"><Edit2 className="h-3.5 w-3.5" /></button>
                        <button onClick={() => handleDelete(voice)} className="rounded-md border p-1.5 hover:bg-red-50 hover:text-red-600 hover:border-red-200">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Phase 5: Expression panel for selected voice */}
          {showExpression && selectedVoiceId && (() => {
            const voice = voices.find(v => v.id === selectedVoiceId);
            if (!voice) return null;
            return (
              <div className="rounded-xl border bg-card p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" /> Voice Controls — {voice.name}
                  </h3>
                  <button onClick={() => { setShowExpression(false); setSelectedVoiceId(null); }}
                    className="text-xs text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                </div>

                {/* Capabilities */}
                {capabilities && (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <p className="text-xs font-medium flex items-center gap-1"><Info className="h-3 w-3" /> Capabilities ({capabilities.model})</p>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(capabilities.capabilities).map(([key, cap]) => (
                        <div key={key} className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground capitalize">{key}:</span>
                          {capBadge(cap.supported)}
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground italic">{capabilities.honestSummary}</p>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Custom preview text */}
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs font-medium">Preview Text (custom)</label>
                    <textarea value={previewText} onChange={e => setPreviewText(e.target.value)}
                      className="flex w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[60px] resize-none"
                      maxLength={200} placeholder="Enter custom preview text..." />
                    <span className="text-xs text-muted-foreground">{previewText.length}/200</span>
                  </div>

                  {/* Language selector */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Language
                      {capBadge('REAL')}
                    </label>
                    <select value={previewLang}
                      onChange={e => { setPreviewLang(e.target.value); setPreviewText(PREVIEW_TEXTS[e.target.value] ?? previewText); }}
                      className="flex h-9 w-full rounded-md border bg-background px-3 py-1.5 text-sm">
                      {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                    </select>
                  </div>

                  {/* Speed control — REAL */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium flex items-center gap-1">
                      Speed: {previewSpeed.toFixed(2)}x {capBadge('REAL')}
                    </label>
                    <input type="range" min="0.5" max="2.0" step="0.05"
                      value={previewSpeed} onChange={e => setPreviewSpeed(Number(e.target.value))}
                      className="w-full" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>0.5x (slow)</span><span>2.0x (fast)</span>
                    </div>
                  </div>

                  {/* GPU-required controls — shown but clearly labeled */}
                  <div className="sm:col-span-2 rounded-lg border border-dashed p-3 space-y-2">
                    <p className="text-xs font-medium flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 text-purple-500" />
                      Advanced Controls — Available in Phase 6 (GPU Required)
                    </p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {["Emotion", "Style", "Energy"].map(ctrl => (
                        <div key={ctrl} className="space-y-1">
                          <label className="text-xs text-muted-foreground flex items-center gap-1">
                            {ctrl} {capBadge('GPU_REQUIRED')}
                          </label>
                          <select disabled className="flex h-8 w-full rounded-md border bg-muted px-2 py-1 text-xs opacity-50 cursor-not-allowed">
                            <option>GPU required</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <button onClick={() => handlePreview(voice, previewText, previewSpeed, previewLang)}
                  disabled={previewing === voice.id}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {previewing === voice.id ? <><Loader2 className="h-4 w-4 animate-spin" /> Playing...</> : <><Play className="h-4 w-4" /> Preview with Controls</>}
                </button>
              </div>
            );
          })()}

          <p className="text-xs text-muted-foreground text-center">
            {voices.length} voice{voices.length !== 1 ? "s" : ""} · Click a voice to open expression controls · Zarax TTS powered by Kokoro-82M (Apache 2.0)
          </p>
        </div>
      )}

      {/* ── DESIGN TAB ── */}
      {tab === "design" && (
        <div className="space-y-6">
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold flex items-center gap-2"><Wand2 className="h-4 w-4 text-primary" /> Describe Your Voice</h2>
              <p className="text-sm text-muted-foreground mt-1">Describe the voice you want in natural language.</p>
            </div>
            <textarea value={designPrompt} onChange={e => setDesignPrompt(e.target.value)}
              placeholder="e.g. Young Indian female voice, warm and friendly, conversational, clear Hindi and English..."
              className="flex min-h-[100px] w-full rounded-md border bg-background px-3 py-2 text-sm resize-none" maxLength={500} />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{designPrompt.length}/500</span>
              <button onClick={handleDesign} disabled={designing || designPrompt.trim().length < 10}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {designing ? <><Loader2 className="h-4 w-4 animate-spin" /> Designing...</> : <><Wand2 className="h-4 w-4" /> Generate Candidates</>}
              </button>
            </div>
          </div>

          {designError && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{designError}</div>}
          {previewError && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{previewError}</div>}

          {designResult && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Voice Candidates</h3>
                <span className="text-xs text-muted-foreground">{designResult.candidates.length} matches found</span>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Detected Profile</p>
                <div className="flex flex-wrap gap-1.5">
                  {[designResult.profile.gender, designResult.profile.ageStyle, designResult.profile.accent, designResult.profile.tone, designResult.profile.speakingStyle].filter(Boolean).map(tag => (
                    <span key={tag} className="text-xs bg-background border rounded-full px-2 py-0.5">{tag}</span>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {designResult.candidates.map(candidate => (
                  <div key={candidate.candidateId} className={`rounded-xl border bg-card p-5 space-y-3 ${candidate.rank === 1 ? "border-primary/30 ring-1 ring-primary/20" : ""}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold">{candidate.name}</p>
                          {candidate.rank === 1 && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />}
                        </div>
                        <span className="text-xs text-muted-foreground">Best match #{candidate.rank}</span>
                      </div>
                      <span className="text-xs bg-violet-100 text-violet-700 dark:bg-violet-900/30 px-1.5 py-0.5 rounded-full font-medium">Zarax TTS</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{candidate.description}</p>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => handlePreviewCandidate(candidate)} disabled={previewingCandidate === candidate.candidateId}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
                        {previewingCandidate === candidate.candidateId ? <><Loader2 className="h-3 w-3 animate-spin" /> Playing...</> : <><Play className="h-3 w-3" /> Preview</>}
                      </button>
                      {savedCandidates.has(candidate.candidateId) ? (
                        <button disabled className="rounded-md border p-1.5 bg-green-50 text-green-600"><Check className="h-3.5 w-3.5" /></button>
                      ) : (
                        <button onClick={() => handleSaveCandidate(candidate)} disabled={savingCandidate === candidate.candidateId}
                          className="rounded-md border p-1.5 hover:bg-primary/10 hover:text-primary hover:border-primary/30">
                          {savingCandidate === candidate.candidateId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!designResult && !designing && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Wand2 className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-sm text-muted-foreground">Describe your ideal voice above to generate candidates.</p>
            </div>
          )}
        </div>
      )}

      {/* ── CLONE TAB ── */}
      {tab === "clone" && (
        <div className="space-y-6">
          {cloneInfo && !cloneInfo.synthesisAvailable && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
                <AlertCircle className="h-4 w-4" /> Voice Synthesis Unavailable
              </div>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                You can create a voice profile, but audio synthesis requires GPU infrastructure (Chatterbox Multilingual V3, ~8GB VRAM).
                Your voice profile will be ready for synthesis when Phase 6 GPU infrastructure is deployed.
              </p>
            </div>
          )}

          <div className="rounded-xl border bg-card p-6 space-y-5">
            <div>
              <h2 className="text-base font-semibold flex items-center gap-2"><Copy className="h-4 w-4 text-primary" /> Clone Your Voice</h2>
              <p className="text-sm text-muted-foreground mt-1">Upload a recording of your own voice to create a personalized voice profile.</p>
            </div>

            {cloneSuccess && (
              <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-green-700"><CheckCircle2 className="h-4 w-4" /> Voice Profile Created</div>
                <p className="text-xs text-green-600">"{cloneSuccess.name}" — Status: <span className="font-medium">{cloneSuccess.status}</span></p>
                <p className="text-xs text-green-600">{cloneInfo?.synthesisUnavailableMessage}</p>
              </div>
            )}

            {cloneError && (
              <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-700">{cloneError}</div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium">Voice Name *</label>
                <input className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={cloneName} onChange={e => setCloneName(e.target.value)} placeholder="My Voice" maxLength={100} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Description</label>
                <input className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={cloneDesc} onChange={e => setCloneDesc(e.target.value)} placeholder="Optional description" maxLength={500} />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Reference Audio *</label>
              <div className="rounded-lg border-2 border-dashed border-muted-foreground/20 p-6 text-center space-y-2">
                <Upload className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                <div className="text-sm text-muted-foreground">
                  {cloneAudioFile ? (
                    <span className="text-foreground font-medium">{cloneAudioFile.name} ({(cloneAudioFile.size / 1024).toFixed(0)}KB)</span>
                  ) : (
                    <span>WAV, MP3, OGG or M4A · 5s–120s · Max 5MB</span>
                  )}
                </div>
                <button onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                  <Upload className="h-3.5 w-3.5" /> {cloneAudioFile ? "Change file" : "Select file"}
                </button>
                <input ref={fileInputRef} type="file" accept="audio/wav,audio/mpeg,audio/ogg,audio/mp4,audio/m4a"
                  className="hidden" onChange={e => setCloneAudioFile(e.target.files?.[0] ?? null)} />
              </div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold"><Shield className="h-4 w-4 text-primary" /> Required Consent</div>
              {cloneInfo && (
                <div className="text-xs text-muted-foreground bg-background rounded-md p-3 whitespace-pre-line border font-mono">
                  {cloneInfo.consentStatement}
                </div>
              )}
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={consentChecked} onChange={e => setConsentChecked(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border" />
                <span className="text-sm">I have read and agree to the consent statement above.</span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={selfVoiceChecked} onChange={e => setSelfVoiceChecked(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border" />
                <span className="text-sm font-medium">I confirm this is my own voice. I am not cloning the voice of another person.</span>
              </label>
            </div>

            <button onClick={handleCloneSubmit}
              disabled={cloning || !cloneName.trim() || !cloneAudioFile || !consentChecked || !selfVoiceChecked}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {cloning ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating Profile...</> : <><Copy className="h-4 w-4" /> Create Voice Profile</>}
            </button>
            <p className="text-xs text-muted-foreground text-center">Model: Chatterbox Multilingual V3 (MIT) · No fake audio generated · Synthesis requires GPU (Phase 6)</p>
          </div>

          {cloneProfiles.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Your Voice Profiles</h3>
              {cloneProfiles.map(profile => (
                <div key={profile.id} className="rounded-xl border bg-card p-4 flex items-start justify-between gap-4">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold truncate">{profile.name}</p>
                      <span className={`text-xs font-medium ${CLONE_STATUS_COLOR[profile.status] ?? "text-muted-foreground"}`}>
                        {profile.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    {profile.description && <p className="text-xs text-muted-foreground">{profile.description}</p>}
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{profile.audioMimeType}</span><span>·</span>
                      <span>{profile.audioDurationS.toFixed(1)}s</span><span>·</span>
                      <span>{(profile.audioSizeBytes / 1024).toFixed(0)}KB</span>
                    </div>
                    {!profile.synthesisAvail && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">Profile ready · Synthesis awaiting GPU infrastructure (Phase 6)</p>
                    )}
                  </div>
                  <button onClick={() => handleDeleteClone(profile.id, profile.name)}
                    className="rounded-md border p-1.5 hover:bg-red-50 hover:text-red-600 hover:border-red-200 flex-shrink-0">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
