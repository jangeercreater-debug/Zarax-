"use client";
import { useState } from "react";
import { Phone, Clock, Bot, TrendingUp } from "lucide-react";
import { useCallAnalytics, useUsageAnalytics } from "@/hooks/use-analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const { data: calls, isLoading: callsLoading } = useCallAnalytics(days);
  const { data: usage, isLoading: usageLoading } = useUsageAnalytics(days);

  const fmtDur = (ms: number) => { const s = Math.floor(ms/1000); const m = Math.floor(s/60); return m > 0 ? m+"m "+( s%60)+"s" : s+"s"; };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">Platform usage and performance metrics.</p></div>
        <Select value={String(days)} onValueChange={v => setDays(Number(v))}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { title: "Total Calls", value: calls?.calls.total, sub: "In selected period", icon: Phone },
          { title: "Completed", value: calls?.calls.completed, sub: calls ? Math.round((calls.calls.completed/Math.max(calls.calls.total,1))*100)+"%% success" : "—", icon: TrendingUp },
          { title: "Active Now", value: calls?.calls.active, sub: "Currently in progress", icon: Phone },
          { title: "Avg Duration", value: calls?.calls.avgDurationMs ? fmtDur(calls.calls.avgDurationMs) : "—", sub: "Per call", icon: Clock },
        ].map(({ title, value, sub, icon: Icon }) => (
          <Card key={title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{title}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {callsLoading ? <Skeleton className="h-8 w-20" /> : <div className="text-2xl font-bold">{value ?? "—"}</div>}
              <p className="text-xs text-muted-foreground mt-1">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bot className="h-4 w-4" />Top Agents</CardTitle></CardHeader>
          <CardContent>
            {callsLoading && <Skeleton className="h-40 w-full" />}
            {calls?.topAgents?.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No call data yet.</p>}
            {calls?.topAgents && calls.topAgents.length > 0 && (
              <div className="space-y-3">
                {calls.topAgents.map((a, i) => (
                  <div key={a.agentId} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-4">{i+1}.</span>
                      <span className="text-sm font-medium">{a.agentName}</span>
                    </div>
                    <Badge variant="secondary">{a.callCount} calls</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Usage & Cost</CardTitle></CardHeader>
          <CardContent>
            {usageLoading && <Skeleton className="h-40 w-full" />}
            {usage && (
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-2 border-b">
                  <span className="text-sm font-medium">Total Cost</span>
                  <span className="text-lg font-bold">${usage.totalCostUsd.toFixed(4)}</span>
                </div>
                {usage.breakdown.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No usage data yet.</p>}
                {usage.breakdown.map((b, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium capitalize">{b.category}</p>
                      <p className="text-xs text-muted-foreground">{b.provider} · {Math.round(b.quantity).toLocaleString()} {b.unit}</p>
                    </div>
                    <span className="text-sm text-muted-foreground">${b.costUsd.toFixed(4)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}