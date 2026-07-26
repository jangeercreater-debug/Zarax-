"use client";
import { Gauge, TrendingUp, Clock, AlertTriangle, RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clientRequest } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

interface PerfData {
  period: string;
  checkedAt: string;
  calls: {
    total: number; successful: number; errors: number;
    successRatePct: number; avgDurationMs: number;
    maxDurationMs: number; minDurationMs: number;
  };
}

function MetricCard({ title, value, sub, icon: Icon, color }: {
  title: string; value: string | number; sub: string; icon: React.ElementType; color?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={"h-4 w-4 " + (color ?? "text-muted-foreground")} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}

export default function PerformancePage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["system","performance"],
    queryFn: () => clientRequest<PerfData>("/system/performance"),
    refetchInterval: 30000,
  });

  const fmtMs = (ms: number) => ms >= 1000 ? (ms/1000).toFixed(1)+"s" : ms+"ms";
  const successColor = (data?.calls.successRatePct ?? 100) >= 95 ? "text-green-600" : (data?.calls.successRatePct ?? 100) >= 80 ? "text-yellow-600" : "text-red-600";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Performance</h1>
          <p className="text-sm text-muted-foreground">Last 24 hours · Auto-refreshes every 30s</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["system","performance"] })}>
          <RefreshCw className="h-4 w-4 mr-2" />Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? [1,2,3,4].map(i => <Skeleton key={i} className="h-28 w-full rounded-xl" />) : (
          <>
            <MetricCard title="Total Calls" value={data?.calls.total ?? 0} sub="Last 24 hours" icon={Gauge} />
            <MetricCard title="Success Rate" value={(data?.calls.successRatePct ?? 0) + "%"} sub={data?.calls.successful + " successful"} icon={TrendingUp} color={successColor} />
            <MetricCard title="Avg Duration" value={fmtMs(data?.calls.avgDurationMs ?? 0)} sub={"Max: " + fmtMs(data?.calls.maxDurationMs ?? 0)} icon={Clock} />
            <MetricCard title="Errors" value={data?.calls.errors ?? 0} sub="Failed calls" icon={AlertTriangle} color={(data?.calls.errors ?? 0) > 0 ? "text-red-500" : "text-muted-foreground"} />
          </>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Call Duration Breakdown</CardTitle></CardHeader>
        <CardContent>
          {isLoading && <Skeleton className="h-24 w-full" />}
          {data && (
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="rounded-lg bg-muted p-4">
                <p className="text-2xl font-bold">{fmtMs(data.calls.minDurationMs)}</p>
                <p className="text-xs text-muted-foreground mt-1">Min Duration</p>
              </div>
              <div className="rounded-lg bg-muted p-4">
                <p className="text-2xl font-bold">{fmtMs(data.calls.avgDurationMs)}</p>
                <p className="text-xs text-muted-foreground mt-1">Avg Duration</p>
              </div>
              <div className="rounded-lg bg-muted p-4">
                <p className="text-2xl font-bold">{fmtMs(data.calls.maxDurationMs)}</p>
                <p className="text-xs text-muted-foreground mt-1">Max Duration</p>
              </div>
            </div>
          )}
          {!isLoading && !data && <p className="text-sm text-muted-foreground text-center py-6">No performance data available yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}