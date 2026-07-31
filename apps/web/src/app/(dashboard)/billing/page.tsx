"use client";
import { useEffect, useState } from "react";
import { CreditCard, Zap, Bot, FileText, Key, Users, Check } from "lucide-react";

interface UsageItem {
  used: number;
  limit: number;
}

interface BillingData {
  currentPlan: { id: string; name: string; price: number };
  usage: {
    voiceMinutes: UsageItem;
    agents: UsageItem;
    documents: UsageItem;
    apiKeys: UsageItem;
    members: UsageItem;
    calls: { used: number };
  };
  billingPeriod: { start: string; end: string };
}

interface Plan {
  id: string;
  name: string;
  price: number;
  voiceMinutes: number;
  agents: number;
  documents: number;
  apiKeys: number;
  members: number;
  features: string[];
}

function UsageBar({ label, used, limit, icon: Icon, color }: { label: string; used: number; limit: number; icon: React.ElementType; color: string }) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const barColor = pct > 90 ? "bg-red-500" : pct > 70 ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={"h-4 w-4 " + color} />
          <span className="text-sm font-medium">{label}</span>
        </div>
        <span className="text-sm text-muted-foreground">{used} / {limit === -1 ? "Unlimited" : limit}</span>
      </div>
      {limit > 0 && (
        <div className="h-2 w-full rounded-full bg-muted">
          <div className={"h-2 rounded-full transition-all " + barColor} style={{ width: pct + "%" }} />
        </div>
      )}
    </div>
  );
}

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/billing/overview", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/billing/plans", { credentials: "include" }).then((r) => r.json()),
    ])
      .then(([b, p]) => {
        setBilling(b.data ?? b);
        const pd = p.data ?? p;
        setPlans(pd.plans ?? pd ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <div className="grid gap-4 lg:grid-cols-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-48 rounded-xl border bg-card animate-pulse" />)}
        </div>
      </div>
    );
  }

  const u = billing?.usage;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">Manage your plan and track usage.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-6 space-y-2">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">Current Plan</h2>
          </div>
          <p className="text-3xl font-bold">{billing?.currentPlan.name ?? "Free"}</p>
          <p className="text-sm text-muted-foreground">
            {billing?.currentPlan.price === 0 ? "Free forever" : billing?.currentPlan.price === -1 ? "Custom pricing" : "$" + billing?.currentPlan.price + "/month"}
          </p>
          <p className="text-xs text-muted-foreground">
            Billing period: {billing?.billingPeriod.start ? new Date(billing.billingPeriod.start).toLocaleDateString() : ""} - {billing?.billingPeriod.end ? new Date(billing.billingPeriod.end).toLocaleDateString() : ""}
          </p>
        </div>

        <div className="rounded-xl border bg-card p-6 space-y-2">
          <h2 className="text-base font-semibold">This Month</h2>
          <p className="text-3xl font-bold">{u?.calls?.used ?? 0}</p>
          <p className="text-sm text-muted-foreground">Total calls this billing period</p>
          <p className="text-sm">{u?.voiceMinutes?.used ?? 0} voice minutes used</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="text-base font-semibold">Usage</h2>
        <UsageBar label="Voice Minutes" used={u?.voiceMinutes?.used ?? 0} limit={u?.voiceMinutes?.limit ?? 100} icon={Zap} color="text-purple-500" />
        <UsageBar label="Agents" used={u?.agents?.used ?? 0} limit={u?.agents?.limit ?? 2} icon={Bot} color="text-blue-500" />
        <UsageBar label="Documents" used={u?.documents?.used ?? 0} limit={u?.documents?.limit ?? 10} icon={FileText} color="text-orange-500" />
        <UsageBar label="API Keys" used={u?.apiKeys?.used ?? 0} limit={u?.apiKeys?.limit ?? 2} icon={Key} color="text-cyan-500" />
        <UsageBar label="Team Members" used={u?.members?.used ?? 0} limit={u?.members?.limit ?? 2} icon={Users} color="text-green-500" />
      </div>

      <div>
        <h2 className="text-base font-semibold mb-4">Available Plans</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => (
            <div key={plan.id} className={"rounded-xl border p-6 space-y-4 " + (plan.id === billing?.currentPlan.id ? "border-primary ring-2 ring-primary/20" : "")}>
              <div>
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="text-2xl font-bold mt-1">
                  {plan.price === 0 ? "Free" : plan.price === -1 ? "Custom" : "$" + plan.price}
                  {plan.price > 0 && <span className="text-sm font-normal text-muted-foreground">/mo</span>}
                </p>
              </div>
              <div className="space-y-2 text-sm">
                <p>{plan.voiceMinutes === -1 ? "Unlimited" : plan.voiceMinutes} voice minutes</p>
                <p>{plan.agents === -1 ? "Unlimited" : plan.agents} agents</p>
                <p>{plan.documents === -1 ? "Unlimited" : plan.documents} documents</p>
                <p>{plan.members === -1 ? "Unlimited" : plan.members} team members</p>
              </div>
              <div className="space-y-1">
                {plan.features.map((f) => (
                  <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Check className="h-3 w-3 text-green-500" />
                    {f}
                  </div>
                ))}
              </div>
              <button
                disabled={plan.id === billing?.currentPlan.id}
                className={"w-full rounded-md px-4 py-2 text-sm font-medium " + (plan.id === billing?.currentPlan.id ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground hover:bg-primary/90")}
              >
                {plan.id === billing?.currentPlan.id ? "Current Plan" : plan.price === -1 ? "Contact Sales" : "Upgrade"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
