"use client";
import { useEffect, useState } from "react";
import { CreditCard, Zap, Bot, FileText, Key, Users, Check, Clock, Brain, Coins, Receipt, Shield } from "lucide-react";

interface UsageItem { used: number; limit: number }

interface BillingData {
  currentPlan: { id: string; name: string; price: number; features: string[] };
  usage: {
    voiceMinutes: UsageItem; agents: UsageItem; documents: UsageItem;
    apiKeys: UsageItem; members: UsageItem; storage: UsageItem; aiTokens: UsageItem;
    calls: { used: number }; monthlyCost: number;
  };
  billingPeriod: { start: string; end: string };
  credits: { balance: number; autoRenewal: boolean };
  paymentMethods: Array<{ id: string; brand: string; last4: string }>;
  invoices: Array<{ id: string; amount: number; status: string; date: string }>;
}

interface Plan {
  id: string; name: string; price: number; voiceMinutes: number; agents: number;
  documents: number; apiKeys: number; members: number; storage: number; aiTokens: number; features: string[];
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
        <span className="text-sm text-muted-foreground">{used.toLocaleString()} / {limit === -1 ? "Unlimited" : limit.toLocaleString()}</span>
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
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [buyAmount, setBuyAmount] = useState(10);

  useEffect(() => {
    Promise.all([
      fetch("/api/billing/overview", { credentials: "include" }).then(r => r.json()),
      fetch("/api/billing/plans", { credentials: "include" }).then(r => r.json()),
    ]).then(([b, p]) => {
      setBilling(b.data ?? b);
      const pd = p.data ?? p;
      setPlans(pd.plans ?? pd ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleUpgrade = async (planId: string) => {
    setUpgrading(planId);
    const res = await fetch("/api/billing/upgrade", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ planId }),
    }).then(r => r.json());
    const d = res.data ?? res;
    if (d.error) alert(d.error);
    else if (d.checkoutUrl) window.open(d.checkoutUrl);
    else alert("Stripe not configured yet. Add STRIPE_SECRET_KEY to enable upgrades.");
    setUpgrading(null);
  };

  const handleBuyCredits = async () => {
    const res = await fetch("/api/billing/buy-credits", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ amount: buyAmount }),
    }).then(r => r.json());
    const d = res.data ?? res;
    if (d.error) alert(d.error);
    else alert("Stripe not configured yet. Add STRIPE_SECRET_KEY to enable purchases.");
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <div className="grid gap-4 lg:grid-cols-2">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-48 rounded-xl border bg-card animate-pulse" />)}
        </div>
      </div>
    );
  }

  const u = billing?.usage;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">Manage your plan, usage, and payments.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
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
            {fmtDate(billing?.billingPeriod.start ?? "")} - {fmtDate(billing?.billingPeriod.end ?? "")}
          </p>
        </div>

        <div className="rounded-xl border bg-card p-6 space-y-2">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            <h2 className="text-base font-semibold">This Month</h2>
          </div>
          <p className="text-3xl font-bold">{u?.calls?.used ?? 0}</p>
          <p className="text-sm text-muted-foreground">Total calls</p>
          <p className="text-sm">{u?.voiceMinutes?.used ?? 0} voice minutes · ${u?.monthlyCost?.toFixed(2) ?? "0.00"} cost</p>
        </div>

        <div className="rounded-xl border bg-card p-6 space-y-2">
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-green-500" />
            <h2 className="text-base font-semibold">Credits</h2>
          </div>
          <p className="text-3xl font-bold">${billing?.credits?.balance?.toFixed(2) ?? "0.00"}</p>
          <p className="text-sm text-muted-foreground">Auto-renewal: {billing?.credits?.autoRenewal ? "On" : "Off"}</p>
          <div className="flex items-center gap-2 pt-2">
            <select value={buyAmount} onChange={e => setBuyAmount(Number(e.target.value))} className="rounded-md border bg-background px-2 py-1 text-sm">
              <option value={5}>$5</option><option value={10}>$10</option><option value={25}>$25</option><option value={50}>$50</option><option value={100}>$100</option>
            </select>
            <button onClick={handleBuyCredits} className="rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-foreground hover:bg-primary/90">Buy Credits</button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="text-base font-semibold">Usage</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <UsageBar label="Voice Minutes" used={u?.voiceMinutes?.used ?? 0} limit={u?.voiceMinutes?.limit ?? 100} icon={Clock} color="text-purple-500" />
          <UsageBar label="AI Tokens" used={u?.aiTokens?.used ?? 0} limit={u?.aiTokens?.limit ?? 50000} icon={Zap} color="text-yellow-500" />
          <UsageBar label="Agents" used={u?.agents?.used ?? 0} limit={u?.agents?.limit ?? 2} icon={Bot} color="text-blue-500" />
          <UsageBar label="Documents" used={u?.documents?.used ?? 0} limit={u?.documents?.limit ?? 10} icon={FileText} color="text-orange-500" />
          <UsageBar label="API Keys" used={u?.apiKeys?.used ?? 0} limit={u?.apiKeys?.limit ?? 2} icon={Key} color="text-cyan-500" />
          <UsageBar label="Team Members" used={u?.members?.used ?? 0} limit={u?.members?.limit ?? 2} icon={Users} color="text-green-500" />
          <UsageBar label="Storage (Memories)" used={u?.storage?.used ?? 0} limit={u?.storage?.limit ?? 100} icon={Brain} color="text-pink-500" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-base font-semibold">Payment Methods</h2>
          </div>
          {(billing?.paymentMethods?.length ?? 0) === 0 ? (
            <div className="text-center py-6">
              <Shield className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No payment methods added.</p>
              <p className="text-xs text-muted-foreground mt-1">Connect Stripe to add cards.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {billing?.paymentMethods?.map(m => (
                <div key={m.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    <span className="text-sm font-medium capitalize">{m.brand}</span>
                    <span className="text-sm text-muted-foreground">**** {m.last4}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-base font-semibold">Invoices</h2>
          </div>
          {(billing?.invoices?.length ?? 0) === 0 ? (
            <div className="text-center py-6">
              <Receipt className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No invoices yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Invoices will appear after first payment.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {billing?.invoices?.map(inv => (
                <div key={inv.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">${inv.amount.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">{fmtDate(inv.date)}</p>
                  </div>
                  <span className={"text-xs font-medium px-2 py-0.5 rounded-full " + (inv.status === "paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700")}>{inv.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-base font-semibold mb-4">Available Plans</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map(plan => (
            <div key={plan.id} className={"rounded-xl border p-6 space-y-4 " + (plan.id === billing?.currentPlan.id ? "border-primary ring-2 ring-primary/20" : "")}>
              <div>
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="text-2xl font-bold mt-1">
                  {plan.price === 0 ? "Free" : plan.price === -1 ? "Custom" : "$" + plan.price}
                  {plan.price > 0 && <span className="text-sm font-normal text-muted-foreground">/mo</span>}
                </p>
              </div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>{plan.voiceMinutes === -1 ? "Unlimited" : plan.voiceMinutes.toLocaleString()} voice min</p>
                <p>{plan.aiTokens === -1 ? "Unlimited" : (plan.aiTokens / 1000).toFixed(0) + "K"} AI tokens</p>
                <p>{plan.agents === -1 ? "Unlimited" : plan.agents} agents</p>
                <p>{plan.documents === -1 ? "Unlimited" : plan.documents} documents</p>
                <p>{plan.members === -1 ? "Unlimited" : plan.members} team members</p>
              </div>
              <div className="space-y-1">
                {plan.features.map(f => (
                  <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Check className="h-3 w-3 text-green-500 shrink-0" />{f}
                  </div>
                ))}
              </div>
              <button
                onClick={() => handleUpgrade(plan.id)}
                disabled={plan.id === billing?.currentPlan.id || upgrading === plan.id}
                className={"w-full rounded-md px-4 py-2 text-sm font-medium " + (plan.id === billing?.currentPlan.id ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground hover:bg-primary/90")}
              >
                {plan.id === billing?.currentPlan.id ? "Current Plan" : upgrading === plan.id ? "Processing..." : plan.price === -1 ? "Contact Sales" : "Upgrade"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
            
