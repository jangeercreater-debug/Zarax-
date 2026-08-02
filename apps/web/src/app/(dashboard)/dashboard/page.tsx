"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Phone, Bot, FileText, Brain, TrendingUp, Clock, Users, Activity, Key, AlertTriangle, Plus, Upload, UserPlus, CreditCard, CheckCircle, XCircle, Zap } from "lucide-react";

interface DashboardData {
  overview: {
    totalCalls: number; activeCalls: number; todayCalls: number; weekCalls: number; monthCalls: number;
    failedCalls: number; successRate: number; totalAgents: number; publishedAgents: number;
    totalDocuments: number; totalMemories: number; totalMembers: number; totalApiKeys: number;
    avgDurationMs: number; totalMinutes: number; monthlyCost: number;
  };
  recentCalls: Array<{ id: string; agentId: string; startedAt: string; endedAt: string | null; durationMs: number | null; endReason: string | null }>;
  recentErrors: Array<{ id: string; agentId: string; startedAt: string; endReason: string | null }>;
  dailyStats: Array<{ date: string; count: number }>;
}

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

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [systemStatus, setSystemStatus] = useState<{ overall: string; services: Array<{ name: string; status: string }> } | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/stats", { credentials: "include" })
      .then(r => r.json())
      .then(j => { setData(j.data ?? j); setLoading(false); })
      .catch(() => setLoading(false));

    fetch("/api/system/health", { credentials: "include" })
      .then(r => r.json())
      .then(j => setSystemStatus(j.data ?? j))
      .catch(() => undefined);
  }, []);

  const fmtMs = (ms: number) => { const s = Math.floor(ms / 1000); const m = Math.floor(s / 60); return m > 0 ? m + "m " + (s % 60) + "s" : s + "s"; };
  const fmtDate = (d: string) => new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const maxCount = Math.max(...(data?.dailyStats?.map(d => d.count) ?? [1]), 1);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <div key={i} className="h-28 rounded-xl border bg-card animate-pulse" />)}
        </div>
      </div>
    );
  }

  const o = data?.overview;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Welcome back. Here is your platform overview.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Calls" value={o?.totalCalls ?? 0} sub={"Today: " + (o?.todayCalls ?? 0)} icon={Phone} color="text-blue-500" />
        <StatCard title="Active Now" value={o?.activeCalls ?? 0} sub="In progress" icon={Activity} color="text-green-500" />
        <StatCard title="Success Rate" value={(o?.successRate ?? 100) + "%"} sub={o?.failedCalls + " failed"} icon={CheckCircle} color="text-emerald-500" />
        <StatCard title="AI Minutes" value={o?.totalMinutes ?? 0} sub={"Avg: " + fmtMs(o?.avgDurationMs ?? 0)} icon={Clock} color="text-purple-500" />
        <StatCard title="Agents" value={(o?.publishedAgents ?? 0) + "/" + (o?.totalAgents ?? 0)} sub="Published / Total" icon={Bot} color="text-orange-500" />
        <StatCard title="Knowledge Base" value={o?.totalDocuments ?? 0} sub="Documents indexed" icon={FileText} color="text-yellow-500" />
        <StatCard title="Memories" value={o?.totalMemories ?? 0} sub="Stored items" icon={Brain} color="text-pink-500" />
        <StatCard title="Team" value={o?.totalMembers ?? 0} sub={o?.totalApiKeys + " API keys"} icon={Users} color="text-cyan-500" />
        <StatCard title="This Week" value={o?.weekCalls ?? 0} sub="Calls in 7 days" icon={TrendingUp} color="text-indigo-500" />
        <StatCard title="This Month" value={o?.monthCalls ?? 0} sub="Calls in 30 days" icon={TrendingUp} color="text-violet-500" />
        <StatCard title="Monthly Cost" value={"$" + (o?.monthlyCost?.toFixed(2) ?? "0.00")} sub="Current billing period" icon={CreditCard} color="text-rose-500" />
        <StatCard title="Failed Calls" value={o?.failedCalls ?? 0} sub="Total errors" icon={XCircle} color="text-red-500" />
      </div>

      <div className="rounded-xl border bg-card p-4">
        <h3 className="text-sm font-semibold mb-3">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Link href="/agents/new" className="flex items-center gap-2 rounded-lg border p-3 text-sm hover:bg-muted transition-colors">
            <Plus className="h-4 w-4 text-blue-500" />Create Agent
          </Link>
          <Link href="/knowledge-base" className="flex items-center gap-2 rounded-lg border p-3 text-sm hover:bg-muted transition-colors">
            <Upload className="h-4 w-4 text-green-500" />Upload Knowledge
          </Link>
          <Link href="/team" className="flex items-center gap-2 rounded-lg border p-3 text-sm hover:bg-muted transition-colors">
            <UserPlus className="h-4 w-4 text-purple-500" />Invite Member
          </Link>
          <Link href="/billing" className="flex items-center gap-2 rounded-lg border p-3 text-sm hover:bg-muted transition-colors">
            <CreditCard className="h-4 w-4 text-orange-500" />Buy Credits
          </Link>
        </div>
      </div>

      {systemStatus && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Zap className="h-4 w-4" />
            System Status
            <span className={"text-xs font-medium px-2 py-0.5 rounded-full " + (systemStatus.overall === "healthy" ? "bg-green-100 text-green-700" : systemStatus.overall === "degraded" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700")}>{systemStatus.overall}</span>
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {systemStatus.services?.map(s => (
              <div key={s.name} className="flex items-center gap-2 text-sm">
                <div className={"h-2 w-2 rounded-full " + (s.status === "healthy" ? "bg-green-500" : s.status === "degraded" ? "bg-yellow-500" : "bg-red-500")} />
                <span className="text-muted-foreground">{s.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold mb-4">Last 7 Days — Call Volume</h3>
          <div className="flex items-end gap-2 h-32">
            {data?.dailyStats?.map(d => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-muted-foreground">{d.count}</span>
                <div className="w-full bg-primary/80 rounded-t" style={{ height: Math.max((d.count / maxCount) * 100, 4) + "%" }} />
                <span className="text-xs text-muted-foreground">{d.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold mb-4">Recent Calls</h3>
          {data?.recentCalls?.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No calls yet.</p>}
          <div className="space-y-3">
            {data?.recentCalls?.map(c => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium truncate max-w-[180px]">{c.agentId.slice(0, 8)}...</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(c.startedAt)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs">{c.durationMs ? fmtMs(c.durationMs) : "Active"}</p>
                  <p className={"text-xs " + (c.endReason === "error" ? "text-red-500" : "text-muted-foreground")}>{c.endReason ?? "in progress"}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {(data?.recentErrors?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-4 w-4" />
            Recent Errors
          </h3>
          <div className="space-y-2">
            {data?.recentErrors?.map(e => (
              <div key={e.id} className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium text-red-700">{e.endReason}</p>
                  <p className="text-xs text-red-500">{e.agentId.slice(0, 8)}...</p>
                </div>
                <p className="text-xs text-red-500">{fmtDate(e.startedAt)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
