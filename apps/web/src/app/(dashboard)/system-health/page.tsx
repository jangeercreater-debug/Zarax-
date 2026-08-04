"use client";
import { useEffect, useState } from "react";
import { Activity, CheckCircle, XCircle, AlertTriangle, RefreshCw, Server, Clock, Cpu, HardDrive } from "lucide-react";

interface ServiceCheck {
  name: string;
  url: string;
  status: "healthy" | "degraded" | "down";
  responseMs: number;
  error?: string;
}

interface ExternalCheck {
  name: string;
  status: string;
  responseMs?: number;
}

interface HealthData {
  overall: string;
  services: ServiceCheck[];
  external: ExternalCheck[];
  summary: { total: number; healthy: number; degraded: number; down: number };
  timestamp: string;
}

interface SystemInfo {
  service: string;
  version: string;
  nodeVersion: string;
  uptime: number;
  uptimeHuman: string;
  memory: { heapUsed: string; heapTotal: string; rss: string };
  environment: string;
}

const STATUS_CONFIG = {
  healthy: { icon: CheckCircle, color: "text-green-500", bg: "bg-green-100 text-green-700" },
  configured: { icon: CheckCircle, color: "text-green-500", bg: "bg-green-100 text-green-700" },
  degraded: { icon: AlertTriangle, color: "text-yellow-500", bg: "bg-yellow-100 text-yellow-700" },
  down: { icon: XCircle, color: "text-red-500", bg: "bg-red-100 text-red-700" },
  not_configured: { icon: XCircle, color: "text-gray-400", bg: "bg-gray-100 text-gray-500" },
  error: { icon: XCircle, color: "text-red-500", bg: "bg-red-100 text-red-700" },
};

export default function SystemHealthPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    setRefreshing(true);
    await Promise.all([
      fetch("/api/system/health", { credentials: "include" }).then(r => r.json()).then(j => setHealth(j.data ?? j)).catch(() => undefined),
      fetch("/api/system/info", { credentials: "include" }).then(r => r.json()).then(j => setInfo(j.data ?? j)).catch(() => undefined),
    ]);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { fetchData(); }, []);

  const getStatusConfig = (status: string) => STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.down;

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">System Health</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-24 rounded-xl border bg-card animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">System Health</h1>
          <p className="text-sm text-muted-foreground">Real-time status of all Zarax services.</p>
        </div>
        <button onClick={fetchData} disabled={refreshing} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50">
          <RefreshCw className={"h-4 w-4 " + (refreshing ? "animate-spin" : "")} />
          Refresh
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={"rounded-xl border bg-card p-4 " + (health?.overall === "healthy" ? "border-green-200" : "border-red-200")}>
          <div className="flex items-center justify-between pb-2">
            <p className="text-sm text-muted-foreground">Overall Status</p>
            <Activity className={"h-4 w-4 " + (health?.overall === "healthy" ? "text-green-500" : "text-red-500")} />
          </div>
          <p className={"text-2xl font-bold capitalize " + (health?.overall === "healthy" ? "text-green-600" : "text-red-600")}>{health?.overall ?? "unknown"}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between pb-2">
            <p className="text-sm text-muted-foreground">Healthy</p>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </div>
          <p className="text-2xl font-bold">{health?.summary?.healthy ?? 0} / {health?.summary?.total ?? 0}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between pb-2">
            <p className="text-sm text-muted-foreground">Uptime</p>
            <Clock className="h-4 w-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold">{info?.uptimeHuman ?? "—"}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between pb-2">
            <p className="text-sm text-muted-foreground">Memory</p>
            <Cpu className="h-4 w-4 text-purple-500" />
          </div>
          <p className="text-2xl font-bold">{info?.memory?.rss ?? "—"}</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Server className="h-4 w-4" />Microservices</h3>
        <div className="space-y-2">
          {health?.services?.map(svc => {
            const cfg = getStatusConfig(svc.status);
            const Icon = cfg.icon;
            return (
              <div key={svc.name} className="flex items-center justify-between rounded-lg border px-4 py-3 hover:bg-muted/40">
                <div className="flex items-center gap-3">
                  <Icon className={"h-4 w-4 " + cfg.color} />
                  <div>
                    <p className="text-sm font-medium">{svc.name}</p>
                    {svc.error && <p className="text-xs text-red-500">{svc.error}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{svc.responseMs}ms</span>
                  <span className={"text-xs font-medium px-2 py-0.5 rounded-full " + cfg.bg}>{svc.status}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><HardDrive className="h-4 w-4" />External Dependencies</h3>
        <div className="space-y-2">
          {health?.external?.map(ext => {
            const cfg = getStatusConfig(ext.status);
            const Icon = cfg.icon;
            return (
              <div key={ext.name} className="flex items-center justify-between rounded-lg border px-4 py-3">
                <div className="flex items-center gap-3">
                  <Icon className={"h-4 w-4 " + cfg.color} />
                  <p className="text-sm font-medium">{ext.name}</p>
                </div>
                <span className={"text-xs font-medium px-2 py-0.5 rounded-full " + cfg.bg}>{ext.status}</span>
              </div>
            );
          })}
        </div>
      </div>

      {info && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold mb-4">System Info</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Version</p>
              <p className="text-sm font-medium">{info.version}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Node.js</p>
              <p className="text-sm font-medium">{info.nodeVersion}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Environment</p>
              <p className="text-sm font-medium capitalize">{info.environment}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Heap Used</p>
              <p className="text-sm font-medium">{info.memory.heapUsed}</p>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center">Last checked: {health?.timestamp ? new Date(health.timestamp).toLocaleString() : "—"}</p>
    </div>
  );
}
