"use client";
import { useEffect, useState } from "react";
import { Building2, Users, Bot, Phone, FileText, Key, Save, Loader2, Plus, Trash2, ArrowRightLeft, Brain, Globe, Clock } from "lucide-react";

interface WorkspaceData {
  id: string; name: string; slug: string; plan: string; status: string;
  logoUrl: string | null; industry: string | null; timezone: string | null;
  language: string | null; companyUrl: string | null;
}

interface WorkspaceStats {
  members: number; agents: number; calls: number; documents: number; apiKeys: number; memories: number;
}

interface WorkspaceItem {
  id: string; name: string; slug: string; plan: string; status: string;
  logoUrl: string | null; role: string; joinedAt: string;
}

const TIMEZONES = ["UTC", "Asia/Kolkata", "America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Tokyo", "Asia/Dubai", "Australia/Sydney"];
const LANGUAGES = [
  { code: "en", label: "English" }, { code: "hi", label: "Hindi" },
  { code: "es", label: "Spanish" }, { code: "fr", label: "French" },
  { code: "de", label: "German" }, { code: "ja", label: "Japanese" },
  { code: "ar", label: "Arabic" }, { code: "pt", label: "Portuguese" },
];
const INDUSTRIES = ["Technology", "Healthcare", "Finance", "Education", "E-commerce", "Real Estate", "Travel", "Media", "Legal", "Other"];

export default function WorkspacePage() {
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [stats, setStats] = useState<WorkspaceStats | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [industry, setIndustry] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [language, setLanguage] = useState("en");
  const [companyUrl, setCompanyUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/tenants/me", { credentials: "include" }).then(r => r.json()),
      fetch("/api/tenants/me/stats", { credentials: "include" }).then(r => r.json()),
      fetch("/api/tenants/list", { credentials: "include" }).then(r => r.json()),
    ]).then(([w, s, l]) => {
      const wd = w.data ?? w;
      setWorkspace(wd);
      setName(wd.name ?? "");
      setLogoUrl(wd.logoUrl ?? "");
      setIndustry(wd.industry ?? "");
      setTimezone(wd.timezone ?? "UTC");
      setLanguage(wd.language ?? "en");
      setCompanyUrl(wd.companyUrl ?? "");
      setStats(s.data ?? s);
      const ld = l.data ?? l;
      setWorkspaces(ld.workspaces ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true); setSaved(false);
    await fetch("/api/tenants/me", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ name, logoUrl: logoUrl || null, industry: industry || null, timezone, language, companyUrl: companyUrl || null }),
    });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleCreate = async () => {
    if (!newName || !newSlug) return;
    setCreating(true);
    const res = await fetch("/api/tenants/create", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ name: newName, slug: newSlug.toLowerCase().replace(/[^a-z0-9-]/g, ""), industry, timezone, language }),
    }).then(r => r.json());
    const d = res.data ?? res;
    if (d.error) { alert(d.error); setCreating(false); return; }
    setWorkspaces(prev => [...prev, { id: d.id, name: d.name, slug: d.slug, plan: "FREE", status: "PENDING_SETUP", logoUrl: null, role: "owner", joinedAt: new Date().toISOString() }]);
    setShowCreate(false); setNewName(""); setNewSlug(""); setCreating(false);
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this workspace? Data will be retained for 30 days.")) return;
    await fetch("/api/tenants/me/delete", { method: "DELETE", credentials: "include" });
    alert("Workspace deactivated.");
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Workspace</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-24 rounded-xl border bg-card animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workspace</h1>
          <p className="text-sm text-muted-foreground">Manage your workspace settings and organization.</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" />New Workspace
        </button>
      </div>

      {showCreate && (
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <h2 className="text-base font-semibold">Create New Workspace</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Workspace Name</label>
              <input className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm" value={newName} onChange={e => setNewName(e.target.value)} placeholder="My Company" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Workspace URL</label>
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">zarax.app/</span>
                <input className="flex h-10 flex-1 rounded-md border bg-background px-3 py-2 text-sm" value={newSlug} onChange={e => setNewSlug(e.target.value)} placeholder="my-company" />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={creating} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {creating ? "Creating..." : "Create Workspace"}
            </button>
            <button onClick={() => setShowCreate(false)} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">Cancel</button>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {[
          { label: "Members", value: stats?.members ?? 0, icon: Users, color: "text-blue-500" },
          { label: "Agents", value: stats?.agents ?? 0, icon: Bot, color: "text-green-500" },
          { label: "Calls", value: stats?.calls ?? 0, icon: Phone, color: "text-purple-500" },
          { label: "Documents", value: stats?.documents ?? 0, icon: FileText, color: "text-orange-500" },
          { label: "API Keys", value: stats?.apiKeys ?? 0, icon: Key, color: "text-cyan-500" },
          { label: "Memories", value: stats?.memories ?? 0, icon: Brain, color: "text-pink-500" },
        ].map(s => (
          <div key={s.label} className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between pb-2">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <s.icon className={"h-4 w-4 " + s.color} />
            </div>
            <p className="text-2xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-base font-semibold">Organization Profile</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Workspace Name</label>
            <input className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Workspace URL</label>
            <input className="flex h-10 w-full rounded-md border bg-muted px-3 py-2 text-sm" value={workspace?.slug ?? ""} disabled />
            <p className="text-xs text-muted-foreground">Cannot be changed.</p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Company Logo URL</label>
            <input className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://example.com/logo.png" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Company Website</label>
            <input className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm" value={companyUrl} onChange={e => setCompanyUrl(e.target.value)} placeholder="https://example.com" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Industry</label>
            <select className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm" value={industry} onChange={e => setIndustry(e.target.value)}>
              <option value="">Select industry</option>
              {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium flex items-center gap-1"><Clock className="h-3 w-3" />Timezone</label>
            <select className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm" value={timezone} onChange={e => setTimezone(e.target.value)}>
              {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium flex items-center gap-1"><Globe className="h-3 w-3" />Language</label>
            <select className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm" value={language} onChange={e => setLanguage(e.target.value)}>
              {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Plan</label>
            <input className="flex h-10 w-full rounded-md border bg-muted px-3 py-2 text-sm uppercase" value={workspace?.plan ?? ""} disabled />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving..." : "Save Changes"}
          </button>
          {saved && <span className="text-sm text-green-600">Saved!</span>}
        </div>
      </div>

      {workspaces.length > 1 && (
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-base font-semibold">Your Workspaces</h2>
          </div>
          <div className="divide-y">
            {workspaces.map(w => (
              <div key={w.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium">{w.name}</p>
                  <p className="text-xs text-muted-foreground">{w.slug} · {w.plan} · {w.role}</p>
                </div>
                <span className={"text-xs font-medium px-2 py-0.5 rounded-full " + (w.id === workspace?.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                  {w.id === workspace?.id ? "Current" : "Switch"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 p-6 space-y-4">
        <h2 className="text-base font-semibold text-red-700">Danger Zone</h2>
        <p className="text-sm text-red-600">Once you delete a workspace, all data will be deactivated. Data is retained for 30 days before permanent deletion.</p>
        <button onClick={handleDelete} className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
          <Trash2 className="h-4 w-4" />Delete Workspace
        </button>
      </div>
    </div>
  );
}
