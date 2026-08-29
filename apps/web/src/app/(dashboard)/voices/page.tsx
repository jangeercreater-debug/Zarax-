"use client";
import { useEffect, useState } from "react";
import {
  Mic, Search, Play, Plus, Trash2, Edit2, Check,
  Globe, Sparkles, Volume2, Loader2, Wand2, Save,
  Star, Filter, X
} from "lucide-react";

interface Voice {
  id: string;
  name: string;
  description: string | null;
  voiceType: string;
  gender: string;
  language: string;
  languages: string[];
  accent: string | null;
  style: string | null;
  provider: string | null;
  providerVoiceId: string | null;
  status: string;
  isPublic: boolean;
  isDefault: boolean;
  metadata: Record<string, unknown> | null;
}

interface VoiceCandidate {
  candidateId: string;
  name: string;
  description: string;
  providerVoiceId: string;
  previewText: string;
  rank: number;
  profile: {
    gender: string;
    ageStyle: string;
    accent: string;
    tone: string;
    personality: string;
    speakingStyle: string;
    speed: number;
    energy: number;
    languages: string[];
    tags: string[];
  };
}

interface DesignResult {
  requestId: string;
  prompt: string;
  profile: VoiceCandidate["profile"];
  candidates: VoiceCandidate[];
}

const TYPE_COLORS: Record<string, string> = {
  SYSTEM: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  CUSTOM: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  GENERATED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  CLONED: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  MARKETPLACE: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
};

const GENDER_ICON: Record<string, string> = { FEMALE: "♀", MALE: "♂", NEUTRAL: "◈" };

type Tab = "library" | "design";

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

  // Voice Design state
  const [designPrompt, setDesignPrompt] = useState("");
  const [designing, setDesigning] = useState(false);
  const [designResult, setDesignResult] = useState<DesignResult | null>(null);
  const [designError, setDesignError] = useState<string | null>(null);
  const [previewingCandidate, setPreviewingCandidate] = useState<string | null>(null);
  const [savingCandidate, setSavingCandidate] = useState<string | null>(null);
  const [savedCandidates, setSavedCandidates] = useState<Set<string>>(new Set());

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (genderFilter) params.set("gender", genderFilter);
    if (langFilter) params.set("language", langFilter);
    if (typeFilter) params.set("voiceType", typeFilter);
    fetch("/api/voices?" + params.toString(), { credentials: "include" })
      .then(r => r.json())
      .then(j => { setVoices((j.data ?? []) as Voice[]); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { if (tab === "library") load(); }, [search, genderFilter, langFilter, typeFilter, tab]);

  const handlePreview = async (voice: Voice) => {
    if (!voice.providerVoiceId) { setPreviewError("No provider ID — preview unavailable."); return; }
    setPreviewing(voice.id); setPreviewError(null);
    try {
      const res = await fetch(`/api/voices/${voice.id}/preview`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ sampleText: `Hi! I am ${voice.name}. How can I help you today?` }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})) as { voiceErrorCode?: string }; setPreviewError(e.voiceErrorCode === "VOICE_PROVIDER_NOT_CONFIGURED" ? "TTS not configured." : "Preview failed."); return; }
      const blob = await res.blob(); const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => { URL.revokeObjectURL(url); setPreviewing(null); };
      audio.onerror = () => { URL.revokeObjectURL(url); setPreviewing(null); setPreviewError("Playback failed."); };
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
        credentials: "include", body: JSON.stringify({ providerVoiceId: candidate.providerVoiceId, sampleText: candidate.previewText }),
      });
      if (!res.ok) { setPreviewError("Preview failed — TTS may not be configured."); return; }
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Mic className="h-6 w-6 text-primary" /> Voice Library
          </h1>
          <p className="text-sm text-muted-foreground">Zarax voices powered by Kokoro-82M (Apache 2.0)</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {[{ id: "library" as Tab, label: "Library", icon: Volume2 }, { id: "design" as Tab, label: "Voice Design", icon: Wand2 }].map(t => (
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
                { label: "Gender", value: genderFilter, set: setGenderFilter, opts: [["", "All genders"], ["FEMALE", "Female"], ["MALE", "Male"], ["NEUTRAL", "Neutral"]] },
                { label: "Language", value: langFilter, set: setLangFilter, opts: [["", "All languages"], ["en", "English"], ["hi", "Hindi"]] },
                { label: "Type", value: typeFilter, set: setTypeFilter, opts: [["", "All types"], ["SYSTEM", "System"], ["CUSTOM", "Custom"]] },
              ].map(f => (
                <select key={f.label} value={f.value} onChange={e => f.set(e.target.value)}
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
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
              {previewError}
            </div>
          )}

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1,2,3,4].map(i => <div key={i} className="h-48 rounded-xl border bg-card animate-pulse" />)}
            </div>
          ) : voices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Volume2 className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-sm text-muted-foreground">No voices found.</p>
              <button onClick={() => setTab("design")} className="mt-4 text-sm text-primary hover:underline flex items-center gap-1">
                <Wand2 className="h-3.5 w-3.5" /> Design a voice
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {voices.map(voice => (
                <div key={voice.id} className={`rounded-xl border bg-card p-5 space-y-3 hover:shadow-md transition-shadow ${voice.isDefault ? "border-primary/30 ring-1 ring-primary/20" : ""}`}>
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
                      <span className="text-xs bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 px-1.5 py-0.5 rounded-full font-medium">Zarax TTS</span>
                    )}
                  </div>
                  {voice.description && <p className="text-xs text-muted-foreground line-clamp-2">{voice.description}</p>}
                  <div className="flex flex-wrap gap-1">
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Globe className="h-3 w-3" />{voice.language.toUpperCase()}</span>
                    {voice.style && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Sparkles className="h-3 w-3" />{voice.style}</span>}
                    {voice.accent && <span className="text-xs text-muted-foreground">· {voice.accent}</span>}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button onClick={() => handlePreview(voice)} disabled={previewing === voice.id}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
                      {previewing === voice.id ? <><Loader2 className="h-3 w-3 animate-spin" /> Playing...</> : <><Play className="h-3 w-3" /> Preview</>}
                    </button>
                    {!voice.isPublic && (
                      <>
                        <button className="rounded-md border p-1.5 hover:bg-muted" title="Edit"><Edit2 className="h-3.5 w-3.5" /></button>
                        <button onClick={() => handleDelete(voice)} className="rounded-md border p-1.5 hover:bg-red-50 hover:text-red-600 hover:border-red-200" title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground text-center">
            {voices.length} voice{voices.length !== 1 ? "s" : ""} · Zarax TTS powered by Kokoro-82M (Apache 2.0)
          </p>
        </div>
      )}

      {/* ── VOICE DESIGN TAB ── */}
      {tab === "design" && (
        <div className="space-y-6">
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold flex items-center gap-2"><Wand2 className="h-4 w-4 text-primary" /> Describe Your Voice</h2>
              <p className="text-sm text-muted-foreground mt-1">Describe the voice you want in natural language. Zarax will generate matching candidates.</p>
            </div>
            <textarea
              value={designPrompt}
              onChange={e => setDesignPrompt(e.target.value)}
              placeholder="e.g. Young Indian female voice, warm and friendly, conversational, clear Hindi and English, confident but approachable..."
              className="flex min-h-[100px] w-full rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
              maxLength={500}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{designPrompt.length}/500</span>
              <button onClick={handleDesign} disabled={designing || designPrompt.trim().length < 10}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {designing ? <><Loader2 className="h-4 w-4 animate-spin" /> Designing...</> : <><Wand2 className="h-4 w-4" /> Generate Candidates</>}
              </button>
            </div>
          </div>

          {designError && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-700">{designError}</div>
          )}

          {previewError && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-700">{previewError}</div>
          )}

          {designResult && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Voice Candidates</h3>
                <span className="text-xs text-muted-foreground">{designResult.candidates.length} matches found</span>
              </div>

              <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Detected Profile</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    designResult.profile.gender,
                    designResult.profile.ageStyle,
                    designResult.profile.accent,
                    designResult.profile.tone,
                    designResult.profile.speakingStyle,
                  ].filter(Boolean).map(tag => (
                    <span key={tag} className="text-xs bg-background border rounded-full px-2 py-0.5">{tag}</span>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {designResult.candidates.map((candidate) => (
                  <div key={candidate.candidateId} className={`rounded-xl border bg-card p-5 space-y-3 ${candidate.rank === 1 ? "border-primary/30 ring-1 ring-primary/20" : ""}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold">{candidate.name}</p>
                          {candidate.rank === 1 && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />}
                        </div>
                        <span className="text-xs text-muted-foreground">Best match #{candidate.rank}</span>
                      </div>
                      <span className="text-xs bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 px-1.5 py-0.5 rounded-full font-medium">Zarax TTS</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{candidate.description}</p>
                    <div className="flex flex-wrap gap-1">
                      {candidate.profile.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="text-xs bg-muted rounded-full px-2 py-0.5">{tag}</span>
                      ))}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => handlePreviewCandidate(candidate)}
                        disabled={previewingCandidate === candidate.candidateId}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
                        {previewingCandidate === candidate.candidateId ? <><Loader2 className="h-3 w-3 animate-spin" /> Playing...</> : <><Play className="h-3 w-3" /> Preview</>}
                      </button>
                      {savedCandidates.has(candidate.candidateId) ? (
                        <button disabled className="rounded-md border p-1.5 bg-green-50 text-green-600 border-green-200" title="Saved">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button onClick={() => handleSaveCandidate(candidate)}
                          disabled={savingCandidate === candidate.candidateId}
                          className="rounded-md border p-1.5 hover:bg-primary/10 hover:text-primary hover:border-primary/30" title="Save to library">
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
              <div className="mt-4 space-y-1 text-xs text-muted-foreground">
                <p>"Young Indian female voice, warm and conversational"</p>
                <p>"Professional English male voice, confident and clear"</p>
                <p>"Hindi female voice, gentle and friendly"</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
