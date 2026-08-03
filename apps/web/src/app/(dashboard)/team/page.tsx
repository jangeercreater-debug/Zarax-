"use client";
import { useEffect, useState } from "react";
import { Users, Shield, UserMinus, ChevronDown, UserCheck, UserX } from "lucide-react";

interface Member {
  id: string;
  fullName: string;
  email: string;
  role: string;
  joinedAt: string;
  isOwner: boolean;
  suspended?: boolean;
}

interface TeamStats {
  total: number;
  byRole: Array<{ role: string; count: number }>;
}

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-purple-100 text-purple-700",
  admin: "bg-blue-100 text-blue-700",
  manager: "bg-teal-100 text-teal-700",
  developer: "bg-orange-100 text-orange-700",
  support: "bg-yellow-100 text-yellow-700",
  member: "bg-green-100 text-green-700",
  viewer: "bg-gray-100 text-gray-700",
};

const ROLES = ["admin", "manager", "developer", "support", "member", "viewer"];

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [stats, setStats] = useState<TeamStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingRole, setEditingRole] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/team/members", { credentials: "include" }).then(r => r.json()),
      fetch("/api/team/stats", { credentials: "include" }).then(r => r.json()),
    ]).then(([m, s]) => {
      const md = m.data ?? m;
      setMembers(md.members ?? []);
      setStats(s.data ?? s);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleRoleChange = async (userId: string, newRole: string) => {
    await fetch("/api/team/members/" + userId + "/role", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ role: newRole }),
    });
    setMembers(prev => prev.map(m => m.id === userId ? { ...m, role: newRole } : m));
    setEditingRole(null);
  };

  const handleRemove = async (userId: string, name: string) => {
    if (!confirm("Remove " + name + " from the team?")) return;
    await fetch("/api/team/members/" + userId, { method: "DELETE", credentials: "include" });
    setMembers(prev => prev.filter(m => m.id !== userId));
  };

  const handleSuspend = async (userId: string) => {
    await fetch("/api/team/members/" + userId + "/role", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ role: "viewer" }),
    });
    setMembers(prev => prev.map(m => m.id === userId ? { ...m, role: "viewer", suspended: true } : m));
  };

  const handleActivate = async (userId: string) => {
    await fetch("/api/team/members/" + userId + "/role", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ role: "member" }),
    });
    setMembers(prev => prev.map(m => m.id === userId ? { ...m, role: "member", suspended: false } : m));
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl border bg-card animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="text-sm text-muted-foreground">Manage your team members, roles, and access.</p>
      </div>

      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between pb-2">
              <p className="text-sm text-muted-foreground">Total Members</p>
              <Users className="h-4 w-4 text-blue-500" />
            </div>
            <p className="text-2xl font-bold">{stats.total}</p>
          </div>
          {stats.byRole.map(r => (
            <div key={r.role} className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between pb-2">
                <p className="text-sm text-muted-foreground capitalize">{r.role}s</p>
                <Shield className="h-4 w-4 text-purple-500" />
              </div>
              <p className="text-2xl font-bold">{r.count}</p>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border bg-card">
        <div className="px-4 py-3 border-b">
          <p className="text-sm font-semibold flex items-center gap-2">
            <Users className="h-4 w-4" />
            Team Members
            <span className="text-muted-foreground font-normal">({members.length})</span>
          </p>
        </div>

        {members.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <Users className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No team members yet.</p>
          </div>
        )}

        <div className="divide-y">
          {members.map(m => (
            <div key={m.id} className={"flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/40 " + (m.suspended ? "opacity-60" : "")}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{m.fullName ?? "No name"}</p>
                  {m.suspended && <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">Suspended</span>}
                </div>
                <p className="text-xs text-muted-foreground">{m.email} · Joined {fmtDate(m.joinedAt)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {m.isOwner ? (
                  <span className={"text-xs font-medium px-2 py-0.5 rounded-full " + ROLE_COLORS.owner}>owner</span>
                ) : (
                  <>
                    <div className="relative">
                      <button
                        onClick={() => setEditingRole(editingRole === m.id ? null : m.id)}
                        className={"inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full " + (ROLE_COLORS[m.role] ?? ROLE_COLORS.member)}
                      >
                        {m.role}
                        <ChevronDown className="h-3 w-3" />
                      </button>
                      {editingRole === m.id && (
                        <div className="absolute right-0 top-8 z-10 rounded-md border bg-card shadow-lg py-1 min-w-[120px]">
                          {ROLES.map(r => (
                            <button
                              key={r}
                              onClick={() => handleRoleChange(m.id, r)}
                              className={"block w-full text-left px-3 py-1.5 text-sm hover:bg-muted capitalize " + (r === m.role ? "font-bold" : "")}
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {m.suspended ? (
                      <button onClick={() => handleActivate(m.id)} className="text-green-600 hover:text-green-700 p-1" title="Activate">
                        <UserCheck className="h-4 w-4" />
                      </button>
                    ) : (
                      <button onClick={() => handleSuspend(m.id)} className="text-yellow-600 hover:text-yellow-700 p-1" title="Suspend">
                        <UserX className="h-4 w-4" />
                      </button>
                    )}
                    <button onClick={() => handleRemove(m.id, m.fullName ?? m.email)} className="text-red-500 hover:text-red-700 p-1" title="Remove">
                      <UserMinus className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
