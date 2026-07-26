"use client";
import { Activity, CheckCircle, XCircle, AlertCircle, RefreshCw } from "lucide-react";
import { useSystemHealth } from "@/hooks/use-system-health";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";

const STATUS_ICON = {
  healthy: <CheckCircle className="h-4 w-4 text-green-600" />,
  degraded: <AlertCircle className="h-4 w-4 text-yellow-600" />,
  down: <XCircle className="h-4 w-4 text-red-600" />,
};

const STATUS_BADGE: Record<string,string> = {
  healthy: "bg-green-100 text-green-700 border-0",
  degraded: "bg-yellow-100 text-yellow-700 border-0",
  down: "bg-red-100 text-red-700 border-0",
};

const OVERALL_BG: Record<string,string> = {
  healthy: "border-green-200 bg-green-50 dark:bg-green-950/20",
  degraded: "border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20",
  down: "border-red-200 bg-red-50 dark:bg-red-950/20",
};

export default function SystemHealthPage() {
  const { data, isLoading, dataUpdatedAt } = useSystemHealth();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["system","health"] });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold tracking-tight">System Health</h1>
        <p className="text-sm text-muted-foreground">Real-time status of all Zarax services.</p></div>
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCw className="h-4 w-4 mr-2" />Refresh
        </Button>
      </div>

      {isLoading && <Skeleton className="h-24 w-full rounded-xl" />}

      {data && (
        <div className={"rounded-xl border p-4 " + OVERALL_BG[data.overall]}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {STATUS_ICON[data.overall]}
              <div>
                <p className="font-semibold capitalize">{data.overall === "healthy" ? "All Systems Operational" : data.overall === "degraded" ? "Partial Degradation" : "Service Outage"}</p>
                <p className="text-xs text-muted-foreground">Last checked: {new Date(data.checkedAt).toLocaleTimeString()}</p>
              </div>
            </div>
            <div className="text-right text-sm">
              <p className="font-medium text-green-700">{data.summary.healthy}/{data.summary.total} healthy</p>
              {data.summary.down > 0 && <p className="text-red-600">{data.summary.down} down</p>}
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" />Services</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading && <div className="p-4 space-y-3">{[1,2,3,4,5,6,7].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>}
          {data && (
            <div className="divide-y">
              {data.services.map(svc => (
                <div key={svc.name} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="flex items-center gap-3">
                    {STATUS_ICON[svc.status]}
                    <div>
                      <p className="text-sm font-medium">{svc.name}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">{svc.url}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {svc.latencyMs !== null && <span className="text-xs text-muted-foreground">{svc.latencyMs}ms</span>}
                    <Badge className={"text-xs " + STATUS_BADGE[svc.status]}>{svc.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}