"use client";
import { useEffect, useState } from "react";
import { Shield, Search, Download, Activity, Calendar } from "lucide-react";

interface AuditEntry {
  id: string;
  action: string;
  actorId: string;
  actorType: string;
  resourceType: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  createdAt: string;
}

interface AuditStats {
  total: number;
  todayCount: number;
  weekCount: number;
  topActions: Array<{ action: string; count: number }>;
}

const ACTION_COLORS: Record<string, string> = {
  "auth.login": "bg-green-100 text-green-700",
  "auth.signup": "bg-blue-100 text-blue-700",
  "api_key.created": "bg-purple-100 text-purple-700",
  "api_key.revoked": "bg-red-100 text-red-700",
  "agent.created": "bg-cyan-100 text-cyan-700",
  "agent.updated": "bg-orange-100 text-orange-700",
};

export default function AuditLogsPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [loading, setLoading] = useState(true);

  const fmtDate = (d: string) => new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

  useEffect(() => {
    fetch("/api/audit-logs/stats", { credentials: "include" })
      .then(r => r.json())
      .then(j => setStats(j.data ?? j))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "25");
    if (search) params.set("action", search);
    if (resourceType) params.set("resourceType", resourceType);

    fetch("/api/audit-logs?" + params.toString(), { credentials: "include" })
      .then(r => r.json())
      .then(j => {
        const d = j.data ?? j;
        setEntries(d.items ?? []);
        setTotal(d.total ?? 0);
        setTotalPages(d.totalPages ?? 1);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [page, search, resourceType]);

  const handleExport = () => {
    fetch("/api/audit-logs/export", { credentials: "include" })
      .then(r => r.json())
      .then(j => {
        const csv = (j.data ?? j).csv ?? "";
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "zarax-audit-logs.csv";
        a.click();
        URL.revokeObjectURL(url);
      });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit Logs</h1>
          <p className="text-sm text-muted-foreground">Complete history of all actions in your workspace.</p>
        </div>
        <button onClick={handleExport} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted">
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between pb-2">
              <p className="text-sm text-muted-foreground">Total Events</p>
              <Shield className="h-4 w-4 text-blue-500" />
            </div>
            <p className="text-2xl font-bold">{stats.total}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between pb-2">
              <p className="text-sm text-muted-foreground">Today</p>
              <Calendar className="h-4 w-4 text-green-500" />
            </div>
            <p className="text-2xl font-bold">{stats.todayCount}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between pb-2">
              <p className="text-sm text-muted-foreground">This Week</p>
              <Activity className="h-4 w-4 text-purple-500" />
            </div>
            <p className="text-2xl font-bold">{stats.weekCount}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground pb-2">Top Actions</p>
            <div className="space-y-1">
              {stats.topActions.map(a => (
                <div key={a.action} className="flex items-center justify-between text-xs">
                  <span className="truncate">{a.action}</span>
                  <span className="text-muted-foreground">{a.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            placeholder="Filter by action (e.g. auth.login)..."
            className="flex h-10 w-full rounded-md border bg-background pl-9 px-3 py-2 text-sm"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select
          value={resourceType}
          onChange={e => { setResourceType(e.target.value); setPage(1); }}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="">All resources</option>
          <option value="agent">Agents</option>
          <option value="api_key">API Keys</option>
          <option value="tenant">Workspace</option>
          <option value="user">Users</option>
        </select>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="px-4 py-3 border-b">
          <p className="text-sm font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Audit Trail
            <span className="text-muted-foreground font-normal">({total} entries)</span>
          </p>
        </div>

        {loading && (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-12 w-full rounded bg-muted animate-pulse" />)}
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Shield className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No audit log entries found.</p>
          </div>
        )}

        {!loading && entries.length > 0 && (
          <div className="divide-y">
            {entries.map(entry => (
              <div key={entry.id} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/40">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={"text-xs font-medium px-2 py-0.5 rounded-full border-0 " + (ACTION_COLORS[entry.action] ?? "bg-gray-100 text-gray-700")}>{entry.action}</span>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground truncate">
                      {entry.actorType} · {entry.resourceType ?? "system"}
                      {entry.ipAddress && " · " + entry.ipAddress}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground shrink-0">{fmtDate(entry.createdAt)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded-md border px-3 py-1 text-sm disabled:opacity-50">Previous</button>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="rounded-md border px-3 py-1 text-sm disabled:opacity-50">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
