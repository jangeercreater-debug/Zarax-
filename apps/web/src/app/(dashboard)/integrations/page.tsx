"use client";
import { useEffect, useState } from "react";
import { CreditCard, Phone, MessageSquare, Mail, Calendar, CheckCircle, XCircle, ExternalLink, Zap } from "lucide-react";

interface Integration {
  id: string;
  name: string;
  description: string;
  category: string;
  status: "connected" | "not_configured" | "error";
  configuredKeys: string[];
  missingKeys: string[];
  docsUrl: string;
}

interface Summary {
  total: number;
  connected: number;
  notConfigured: number;
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  payments: CreditCard,
  telephony: Phone,
  messaging: MessageSquare,
  email: Mail,
  calendar: Calendar,
};

const CATEGORY_COLORS: Record<string, string> = {
  payments: "text-green-500",
  telephony: "text-blue-500",
  messaging: "text-purple-500",
  email: "text-orange-500",
  calendar: "text-cyan-500",
};

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetch("/api/integrations", { credentials: "include" })
      .then(r => r.json())
      .then(j => {
        const d = j.data ?? j;
        setIntegrations(d.integrations ?? []);
        setSummary(d.summary ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const categories = ["all", ...new Set(integrations.map(i => i.category))];
  const filtered = filter === "all" ? integrations : integrations.filter(i => i.category === filter);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-48 rounded-xl border bg-card animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="text-sm text-muted-foreground">Connect third-party services to power your AI platform.</p>
      </div>

      {summary && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between pb-2">
              <p className="text-sm text-muted-foreground">Total</p>
              <Zap className="h-4 w-4 text-blue-500" />
            </div>
            <p className="text-2xl font-bold">{summary.total}</p>
            <p className="text-xs text-muted-foreground">Available integrations</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between pb-2">
              <p className="text-sm text-muted-foreground">Connected</p>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </div>
            <p className="text-2xl font-bold">{summary.connected}</p>
            <p className="text-xs text-muted-foreground">Active connections</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between pb-2">
              <p className="text-sm text-muted-foreground">Not Configured</p>
              <XCircle className="h-4 w-4 text-yellow-500" />
            </div>
            <p className="text-2xl font-bold">{summary.notConfigured}</p>
            <p className="text-xs text-muted-foreground">Needs API keys</p>
          </div>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-2">
        {categories.map(c => (
          <button key={c} onClick={() => setFilter(c)} className={"rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors " + (filter === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-secondary")}>
            {c}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map(integration => {
          const Icon = CATEGORY_ICONS[integration.category] ?? Zap;
          const color = CATEGORY_COLORS[integration.category] ?? "text-gray-500";
          const isConnected = integration.status === "connected";

          return (
            <div key={integration.id} className={"rounded-xl border bg-card p-6 space-y-4 " + (isConnected ? "border-green-200 dark:border-green-900" : "")}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={"flex h-10 w-10 items-center justify-center rounded-lg bg-muted " + color}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{integration.name}</h3>
                    <p className="text-xs text-muted-foreground capitalize">{integration.category}</p>
                  </div>
                </div>
                <span className={"text-xs font-medium px-2 py-0.5 rounded-full " + (isConnected ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700")}>
                  {isConnected ? "Connected" : "Not configured"}
                </span>
              </div>

              <p className="text-sm text-muted-foreground">{integration.description}</p>

              {!isConnected && integration.missingKeys.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Missing environment variables:</p>
                  {integration.missingKeys.map(k => (
                    <div key={k} className="flex items-center gap-1 text-xs text-red-500">
                      <XCircle className="h-3 w-3" />{k}
                    </div>
                  ))}
                </div>
              )}

              {isConnected && (
                <div className="flex items-center gap-1 text-xs text-green-600">
                  <CheckCircle className="h-3 w-3" />All keys configured
                </div>
              )}

              <a href={integration.docsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                Documentation <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border bg-muted/50 p-6 space-y-2">
        <h3 className="text-sm font-semibold">How to connect an integration</h3>
        <div className="text-sm text-muted-foreground space-y-1">
          <p>1. Get the API keys from the service provider (links above).</p>
          <p>2. Go to Railway dashboard → API service → Variables tab.</p>
          <p>3. Add the required environment variables shown above.</p>
          <p>4. The service will auto-redeploy and the integration status will update to Connected.</p>
        </div>
      </div>
    </div>
  );
}
