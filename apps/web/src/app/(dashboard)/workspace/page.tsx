"use client";
import { useEffect, useState } from "react";
import { Building2, Users, Bot, Phone, FileText, Key, Save, Loader2 } from "lucide-react";

interface WorkspaceData {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
}

interface WorkspaceStats {
  members: number;
  agents: number;
  calls: number;
  documents: number;
  apiKeys: number;
}

export default function WorkspacePage() {
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [stats, setStats] = useState<WorkspaceStats | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/tenants/me", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/tenants/me/stats", { credentials: "include" }).then((r) => r.json()),
    ])
      .then(([w, s]) => {
        const wd = w.data ?? w;
        setWorkspace(wd);
        setName(wd.name ?? "");
        setStats(s.data ?? s);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    await fetch("/api/tenants/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Workspace</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 rounded-xl border bg-card animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Workspace</h1>
        <p className="text-sm text-muted-foreground">Manage your workspace settings and overview.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Members", value: stats?.members ?? 0, icon: Users, color: "text-blue-500" },
          { label: "Agents", value: stats?.agents ?? 0, icon: Bot, color: "text-green-500" },
          { label: "Calls", value: stats?.calls ?? 0, icon: Phone, color: "text-purple-500" },
          { label: "Documents", value: stats?.documents ?? 0, icon: FileText, color: "text-orange-500" },
          { label: "API Keys", value: stats?.apiKeys ?? 0, icon: Key, color: "text-cyan-500" },
        ].map((s) => (
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
            <input
              className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Workspace URL</label>
            <input
              className="flex h-10 w-full rounded-md border bg-muted px-3 py-2 text-sm"
              value={workspace?.slug ?? ""}
              disabled
            />
            <p className="text-xs text-muted-foreground">Cannot be changed.</p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Plan</label>
            <input
              className="flex h-10 w-full rounded-md border bg-muted px-3 py-2 text-sm uppercase"
              value={workspace?.plan ?? ""}
              disabled
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Status</label>
            <input
              className="flex h-10 w-full rounded-md border bg-muted px-3 py-2 text-sm uppercase"
              value={workspace?.status ?? ""}
              disabled
            />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving..." : "Save Changes"}
          </button>
          {saved && <span className="text-sm text-green-600">Saved successfully!</span>}
        </div>
      </div>
    </div>
  );
}
