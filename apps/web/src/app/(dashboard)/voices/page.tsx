"use client";
import { useEffect, useState } from "react";
import {
  Mic, Search, Play, Plus, Trash2, Edit2, Check,
  Globe, User, Sparkles, Volume2, Loader2
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
  sampleAudioUrl: string | null;
}

const TYPE_COLORS: Record<string, string> = {
  SYSTEM: "bg-blue-100 text-blue-700",
  CUSTOM: "bg-purple-100 text-purple-700",
  GENERATED: "bg-green-100 text-green-700",
  CLONED: "bg-orange-100 text-orange-700",
  MARKETPLACE: "bg-pink-100 text-pink-700",
};

const GENDER_ICON: Record<string, string> = {
  FEMALE: "♀",
  MALE: "♂",
  NEUTRAL: "◈",
};

export default function VoicesPage() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [genderFilter, setGenderFilter] = useState("");
  const [langFilter, setLangFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newProvider, setNewProvider] = useState("cartesia");
  const [newVoiceId, setNewVoiceId] = useState("");
  const [newGender, setNewGender] = useState("NEUTRAL");
  const [newLang, setNewLang] = useState("en");
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (genderFilter) params.set("gender", genderFilter);
    if (langFilter) params.set("language", langFilter);
    if (typeFilter) params.set("voiceType", typeFilter);

    fetch("/api/voices?" + params.toString(), { credentials: "include" })
      .then(r => r.json())
      .then(j => { setVoices((j.data ?? j.data ?? []) as Voice[]); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search, genderFilter, langFilter, typeFilter]);

  const handlePreview = async (voice: Voice) => {
    if (!voice.providerVoiceId) {
      setPreviewError("This voice has no provider ID — preview unavailable.");
      return;
    }
    setPreviewing(voice.id);
    setPreviewError(null);
    try {
      const res = await fetch(`/api/voices/${voice.id}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sampleText: `Hi! I am ${voice.name}. How can I help you today?` }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { voiceErrorCode?: string };
        setPreviewError(err.voiceErrorCode === "VOICE_PROVIDER_NOT_CONFIGURED"
          ? "TTS provider not configured. Add CARTESIA_API_KEY to Railway."
          : "Preview failed. Provider may not be available.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => { URL.revokeObjectURL(url); setPreviewing(null); };
      audio.onerror = () => { URL.revokeObjectURL(url); setPreviewing(null); setPreviewError("Audio playback failed."); };
      await audio.play();
    } catch {
      setPreviewError("Preview request failed.");
    } finally {
      setPreviewing(null);
    }
  };

  const handleDelete = async (voice: Voice) => {
    if (!confirm(`Deactivate voice "${voice.name}"?`)) return;
    await fetch(`/api/voices/${voice.id}`, { method: "DELETE", credentials: "include" });
    setVoices(v => v.filter(x => x.id !== voice.id));
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const res = await fetch("/api/voices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: newName, description: newDesc || undefined,
        provider: newProvider, providerVoiceId: newVoiceId || undefined,
        gender: newGender, language: newLang, voiceType: "CUSTOM",
      }),
    }).then(r => r.json());

    if (res.data) {
      setVoices(v => [...v, res.data as Voice]);
      setShowCreate(false); setNewName(""); setNewDesc(""); setNewVoiceId("");
    }
    setCreating(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Mic className="h-6 w-6 text-primary" /> Voice Library
          </h1>
          <p className="text-sm text-muted-foreground">
            System voices and your custom voices. Phase 2 will add open-source model voices.
          </p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Add Voice
        </button>
      </div>

      {showCreate && (
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <h2 className="text-base font-semibold">Add Custom Voice</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Name *</label>
              <input className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={newName} onChange={e => setNewName(e.target.value)} placeholder="My Voice" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Provider</label>
              <select className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={newProvider} onChange={e => setNewProvider(e.target.value)}>
                <option value="cartesia">Cartesia</option>
                <option value="openai">OpenAI</option>
                <option value="zarax">Zarax (Phase 7)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Provider Voice ID</label>
              <input className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={newVoiceId} onChange={e => setNewVoiceId(e.target.value)} placeholder="e.g. Cartesia UUID" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Gender</label>
              <select className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={newGender} onChange={e => setNewGender(e.target.value)}>
                <option value="FEMALE">Female</option>
                <option value="MALE">Male</option>
                <option value="NEUTRAL">Neutral</option>
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-sm font-medium">Description</label>
              <input className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Brief description" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={creating || !newName.trim()}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {creating ? "Creating..." : "Create Voice"}
            </button>
            <button onClick={() => setShowCreate(false)}
              className="rounded-md border px-4 py-2 text-sm hover:bg-muted">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input placeholder="Search voices..." value={search} onChange={e => setSearch(e.target.value)}
            className="flex h-10 w-full rounded-md border bg-background pl-9 px-3 py-2 text-sm" />
        </div>
        <select value={genderFilter} onChange={e => setGenderFilter(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm">
          <option value="">All genders</option>
          <option value="FEMALE">Female</option>
          <option value="MALE">Male</option>
          <option value="NEUTRAL">Neutral</option>
        </select>
        <select value={langFilter} onChange={e => setLangFilter(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm">
          <option value="">All languages</option>
          <option value="en">English</option>
          <option value="hi">Hindi</option>
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm">
          <option value="">All types</option>
          <option value="SYSTEM">System</option>
          <option value="CUSTOM">Custom</option>
        </select>
      </div>

      {previewError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-700">
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
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {voices.map(voice => (
            <div key={voice.id}
              className={"rounded-xl border bg-card p-5 space-y-3 hover:shadow-md transition-shadow " +
                (voice.isDefault ? "border-primary/30 ring-1 ring-primary/20" : "")}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{GENDER_ICON[voice.gender] ?? "◈"}</span>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold">{voice.name}</p>
                      {voice.isDefault && <Check className="h-3.5 w-3.5 text-primary" />}
                    </div>
                    <span className={"text-xs font-medium px-1.5 py-0.5 rounded-full " + (TYPE_COLORS[voice.voiceType] ?? "bg-gray-100 text-gray-700")}>
                      {voice.voiceType}
                    </span>
                  </div>
                </div>
                {!voice.isPublic && (
                  <span className="text-xs text-muted-foreground border rounded px-1.5 py-0.5">Private</span>
                )}
              </div>

              {voice.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{voice.description}</p>
              )}

              <div className="flex flex-wrap gap-1">
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Globe className="h-3 w-3" />{voice.language.toUpperCase()}
                </span>
                {voice.style && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Sparkles className="h-3 w-3" />{voice.style}
                  </span>
                )}
                {voice.provider && (
                  <span className="text-xs text-muted-foreground capitalize">· {voice.provider}</span>
                )}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button onClick={() => handlePreview(voice)} disabled={previewing === voice.id}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
                  {previewing === voice.id
                    ? <><Loader2 className="h-3 w-3 animate-spin" /> Playing...</>
                    : <><Play className="h-3 w-3" /> Preview</>}
                </button>
                {!voice.isPublic && (
                  <>
                    <button className="rounded-md border p-1.5 hover:bg-muted" title="Edit">
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleDelete(voice)}
                      className="rounded-md border p-1.5 hover:bg-red-50 hover:text-red-600 hover:border-red-200" title="Delete">
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
        {voices.length} voice{voices.length !== 1 ? "s" : ""} available ·
        Phase 2 will add open-source TTS model voices ·
        Phase 3 will add Voice Design Studio
      </p>
    </div>
  );
}
