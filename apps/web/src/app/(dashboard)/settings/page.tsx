"use client";
import { useState, useEffect } from "react";
import { User, Lock, Building2, Shield, Palette, Bot, Mic, Trash2 } from "lucide-react";

const TABS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "security", label: "Security", icon: Lock },
  { id: "organization", label: "Organization", icon: Building2 },
  { id: "permissions", label: "Permissions", icon: Shield },
  { id: "ai", label: "AI Defaults", icon: Bot },
  { id: "voice", label: "Voice", icon: Mic },
  { id: "appearance", label: "Appearance", icon: Palette },
];

export default function SettingsPage() {
  const [tab, setTab] = useState("profile");
  const [profile, setProfile] = useState<{ email: string; fullName: string } | null>(null);
  const [sessions, setSessions] = useState<Array<{ id: string; createdAt: string; isCurrent?: boolean }>>([]);
  const [orgs, setOrgs] = useState<Array<{ tenantId: string; tenantName: string; role: string }>>([]);
  const [fullName, setFullName] = useState("");
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [theme, setTheme] = useState("system");
  const [deleteConfirm, setDeleteConfirm] = useState("");

  useEffect(() => {
    fetch("/api/users/me", { credentials: "include" }).then(r => r.json()).then(j => { const d = j.data ?? j; setProfile(d); setFullName(d.fullName ?? ""); }).catch(() => undefined);
    fetch("/api/users/me/sessions", { credentials: "include" }).then(r => r.json()).then(j => setSessions((j.data ?? j) ?? [])).catch(() => undefined);
    fetch("/api/users/me/memberships", { credentials: "include" }).then(r => r.json()).then(j => setOrgs((j.data ?? j) ?? [])).catch(() => undefined);
  }, []);

  const handleProfileSave = async () => {
    setSaving(true); setSaved(false);
    await fetch("/api/users/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ fullName }) });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handlePasswordChange = async () => {
    setPwError("");
    if (newPw !== confirmPw) { setPwError("Passwords do not match"); return; }
    if (newPw.length < 8) { setPwError("Minimum 8 characters"); return; }
    const res = await fetch("/api/users/me/password", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }) });
    if (!res.ok) { setPwError("Current password is incorrect"); return; }
    setCurrentPw(""); setNewPw(""); setConfirmPw("");
    setSaved(true); setTimeout(() => setSaved(false), 3000);
  };

  const handleRevokeSession = async (id: string) => {
    await fetch("/api/users/me/sessions/" + id, { method: "DELETE", credentials: "include" });
    setSessions(s => s.filter(x => x.id !== id));
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== "DELETE") return;
    await fetch("/api/users/me", { method: "DELETE", credentials: "include" });
    window.location.href = "/login";
  };

  const fmtDate = (d: string) => new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  const ROLES = [
    { role: "OWNER", color: "bg-purple-100 text-purple-700", perms: ["Full access to everything", "Manage billing", "Delete workspace"] },
    { role: "ADMIN", color: "bg-blue-100 text-blue-700", perms: ["Manage agents, workflows", "Manage team members", "Manage API keys", "View analytics and logs"] },
    { role: "MANAGER", color: "bg-teal-100 text-teal-700", perms: ["Manage agents", "Manage team", "View analytics", "Manage knowledge base"] },
    { role: "DEVELOPER", color: "bg-orange-100 text-orange-700", perms: ["Create and manage agents", "Manage workflows and tools", "Manage API keys", "View analytics"] },
    { role: "SUPPORT", color: "bg-yellow-100 text-yellow-700", perms: ["Create and view calls", "View agents", "Execute workflows", "View analytics and audit logs"] },
    { role: "MEMBER", color: "bg-green-100 text-green-700", perms: ["Create calls", "View agents", "Execute workflows"] },
    { role: "VIEWER", color: "bg-gray-100 text-gray-700", perms: ["Read-only access", "View analytics"] },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account and workspace settings.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={"inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors " + (tab === t.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-secondary")}>
            <t.icon className="h-4 w-4" />{t.label}
          </button>
        ))}
      </div>

      {tab === "profile" && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <h2 className="text-base font-semibold">Profile Information</h2>
            <div className="space-y-1">
              <label className="text-sm font-medium">Email</label>
              <input className="flex h-10 w-full rounded-md border bg-muted px-3 py-2 text-sm" value={profile?.email ?? ""} disabled />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Full Name</label>
              <input className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm" value={fullName} onChange={e => setFullName(e.target.value)} />
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleProfileSave} disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{saving ? "Saving..." : "Save Changes"}</button>
              {saved && <span className="text-sm text-green-600">Saved!</span>}
            </div>
          </div>

          <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-600" />
              <h2 className="text-base font-semibold text-red-700">Delete Account</h2>
            </div>
            <p className="text-sm text-red-600">This action is permanent. All your data, agents, and conversations will be permanently deleted.</p>
            <div className="space-y-2">
              <label className="text-sm font-medium text-red-700">Type DELETE to confirm</label>
              <input className="flex h-10 w-full rounded-md border border-red-300 bg-background px-3 py-2 text-sm" value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder="DELETE" />
            </div>
            <button onClick={handleDeleteAccount} disabled={deleteConfirm !== "DELETE"} className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">Permanently Delete Account</button>
          </div>
        </div>
      )}

      {tab === "security" && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <h2 className="text-base font-semibold">Change Password</h2>
            <div className="space-y-1">
              <label className="text-sm font-medium">Current Password</label>
              <input type="password" className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm" value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">New Password</label>
              <input type="password" className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm" value={newPw} onChange={e => setNewPw(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Confirm New Password</label>
              <input type="password" className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
            </div>
            {pwError && <p className="text-sm text-red-500">{pwError}</p>}
            <button onClick={handlePasswordChange} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Change Password</button>
          </div>
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <h2 className="text-base font-semibold">Active Sessions</h2>
            {sessions.length === 0 && <p className="text-sm text-muted-foreground">No active sessions.</p>}
            <div className="divide-y">
              {sessions.map(s => (
                <div key={s.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">{s.isCurrent ? "Current Session" : "Session"}</p>
                    <p className="text-xs text-muted-foreground">Started {fmtDate(s.createdAt)}</p>
                  </div>
                  {s.isCurrent ? <span className="text-xs rounded-full border px-2 py-0.5">Current</span> : <button onClick={() => handleRevokeSession(s.id)} className="text-xs text-red-500 hover:underline">Revoke</button>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "organization" && (
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <h2 className="text-base font-semibold">Organization</h2>
          {orgs.length === 0 && <p className="text-sm text-muted-foreground">No organizations found.</p>}
          {orgs.map(org => (
            <div key={org.tenantId} className="flex items-center justify-between rounded-lg border px-4 py-3">
              <div>
                <p className="text-sm font-medium">{org.tenantName}</p>
                <p className="text-xs text-muted-foreground">Role: {org.role}</p>
              </div>
              <span className="text-xs rounded-full border px-2 py-0.5 uppercase">{org.role}</span>
            </div>
          ))}
        </div>
      )}

      {tab === "permissions" && (
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <h2 className="text-base font-semibold">Role Permissions</h2>
          <p className="text-sm text-muted-foreground">What each role can do in your workspace.</p>
          {ROLES.map(r => (
            <div key={r.role} className="rounded-lg border p-4">
              <span className={"text-xs font-medium px-2 py-0.5 rounded-full " + r.color}>{r.role}</span>
              <ul className="mt-2 space-y-1">
                {r.perms.map(p => <li key={p} className="text-sm text-muted-foreground flex items-center gap-2"><span className="text-green-500">✓</span>{p}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}

      {tab === "ai" && (
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <h2 className="text-base font-semibold">AI Defaults</h2>
          <p className="text-sm text-muted-foreground">Default settings for new agents.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Default LLM Provider</label>
              <select className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"><option>Anthropic (Claude)</option><option>OpenAI</option><option>Groq</option></select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Default Model</label>
              <input className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm" defaultValue="claude-sonnet-4-5" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Default Temperature</label>
              <input className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm" defaultValue="0.7" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Default Max Tokens</label>
              <input className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm" defaultValue="1024" />
            </div>
          </div>
        </div>
      )}

      {tab === "voice" && (
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <h2 className="text-base font-semibold">Voice Settings</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">TTS Provider</label>
              <input className="flex h-10 w-full rounded-md border bg-muted px-3 py-2 text-sm" value="Cartesia" disabled />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">STT Provider</label>
              <input className="flex h-10 w-full rounded-md border bg-muted px-3 py-2 text-sm" value="Deepgram (Nova 2)" disabled />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Default Voice</label>
              <input className="flex h-10 w-full rounded-md border bg-muted px-3 py-2 text-sm" value="Tessa (Female)" disabled />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Sample Rate</label>
              <input className="flex h-10 w-full rounded-md border bg-muted px-3 py-2 text-sm" value="48000 Hz" disabled />
            </div>
          </div>
        </div>
      )}

      {tab === "appearance" && (
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <h2 className="text-base font-semibold">Appearance</h2>
          <div className="space-y-1">
            <label className="text-sm font-medium">Theme</label>
            <div className="flex gap-3">
              {["light", "dark", "system"].map(t => (
                <button key={t} onClick={() => setTheme(t)} className={"rounded-md border px-4 py-2 text-sm capitalize " + (theme === t ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>{t}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
