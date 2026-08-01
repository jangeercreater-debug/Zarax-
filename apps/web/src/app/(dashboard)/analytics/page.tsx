"use client";
import { useEffect, useState } from "react";
import { Phone, Clock, Bot, TrendingUp, Zap, Download, CheckCircle, XCircle } from "lucide-react";

interface CallData {
  period: { days: number };
  calls: { total: number; completed: number; active: number; failed: number; successRate: number; avgDurationMs: number; totalMinutes: number };
  topAgents: Array<{ agentId: string; agentName: string; callCount: number }>;
}

interface UsageData {
  totalCostUsd: number;
  breakdown: Array<{ category: string; provider: string; unit: string; quantity: number; costUsd: number }>;
}

interface TrendItem { date: string; calls: number; minutes: number }

function StatCard({ title, value, sub, icon: Icon, color }: { title: string; value: string | number; sub: string; icon: React.ElementType; color: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between pb-2">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <Icon className={"h-4 w-4 " + color} />
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{sub}</p>
    </div>
  );
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [calls, setCalls] = useState<CallData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [trends, setTrends] = useState<TrendItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/analytics/calls?days=" + days, { credentials: "include" }).then(r => r.json()),
      fetch("/api/analytics/usage?days=" + days, { credentials: "include" }).then(r => r.json()),
      fetch("/api/analytics/trends?days=14", { credentials: "include" }).then(r => r.json()),
    ]).then(([c, u, t]) => {
      setCalls(c.data ?? c);
      setUsage(u.data ?? u);
      const td = t.data ?? t;
      setTrends(td.trends ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [days]);

  const handleExport = () => {
    fetch("/api/analytics/export?days=" + days, { credentials: "include" })
      .then(r => r.json())
      .then(j => {
        const csv = (j.data ?? j).csv ?? "";
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "zarax-analytics-" + days + "d.csv";
        a.click();
        URL.revokeObjectURL(url);
      });
  };

  const fmtMs = (ms: number) => { const s = Math.floor(ms / 1000); const m = Math.floor(s / 60); return m > 0 ? m + "m " + (s % 60) + "s" : s + "s"; };
  const maxCalls = Math.max(...trends.map(t => t.calls), 1);
  const c = calls?.calls;

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-28 rounded-xl border bg-card animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">Platform usage and performance metrics.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button onClick={handleExport} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted">
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard title="Total Calls" value={c?.total ?? 0} sub={"Last " + days + " days"} icon={Phone} color="text-blue-500" />
        <StatCard title="Success Rate" value={(c?.successRate ?? 100) + "%"} sub={c?.completed + " completed"} icon={CheckCircle} color="text-green-500" />
        <StatCard title="Failed" value={c?.failed ?? 0} sub="Error calls" icon={XCircle} color="text-red-500" />
        <StatCard title="Active Now" value={c?.active ?? 0} sub="In progress" icon={Zap} color="text-yellow-500" />
        <StatCard title="Avg Duration" value={fmtMs(c?.avgDurationMs ?? 0)} sub="Per call" icon={Clock} color="text-purple-500" />
        <StatCard title="Total Minutes" value={c?.totalMinutes ?? 0} sub="Voice minutes used" icon={TrendingUp} color="text-cyan-500" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold mb-4">Daily Call Trends (14 days)</h3>
          <div className="flex items-end gap-1 h-36">
            {trends.map(t => (
              <div key={t.date} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-muted-foreground">{t.calls}</span>
                <div className="w-full bg-primary/80 rounded-t" style={{ height: Math.max((t.calls / maxCalls) * 100, 4) + "%" }} />
                <span className="text-xs text-muted-foreground rotate-45 origin-left">{t.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Bot className="h-4 w-4" />Top Agents</h3>
          {calls?.topAgents?.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No call data yet.</p>}
          <div className="space-y-3">
            {calls?.topAgents?.map((a, i) => (
              <div key={a.agentId} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                  <span className="text-sm font-medium">{a.agentName}</span>
                </div>
                <span className="text-sm rounded-full bg-muted px-2 py-0.5">{a.callCount} calls</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <h3 className="text-sm font-semibold mb-4">Usage & Cost Breakdown</h3>
        <div className="flex items-center justify-between pb-3 border-b mb-3">
          <span className="text-sm font-medium">Total Cost</span>
          <span className="text-lg font-bold">${usage?.totalCostUsd?.toFixed(4) ?? "0.00"}</span>
        </div>
        {usage?.breakdown?.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No usage data yet.</p>}
        <div className="space-y-3">
          {usage?.breakdown?.map((b, i) => (
            <div key={i} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium capitalize">{b.category}</p>
                <p className="text-xs text-muted-foreground">{b.provider} · {Math.round(b.quantity).toLocaleString()} {b.unit}</p>
              </div>
              <span className="text-sm text-muted-foreground">${b.costUsd.toFixed(4)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
