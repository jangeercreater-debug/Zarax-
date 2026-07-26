"use client";
import { useState } from "react";
import { Shield, Search } from "lucide-react";
import { useAuditLogs } from "@/hooks/use-audit-logs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const ACTION_COLORS: Record<string,string> = {
  "auth.login": "bg-green-100 text-green-700",
  "auth.signup": "bg-blue-100 text-blue-700",
  "api_key.revoked": "bg-red-100 text-red-700",
  "api_key.created": "bg-purple-100 text-purple-700",
};

export default function AuditLogsPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAuditLogs({ action: search || undefined, page, limit: 25 });

  const fmtDate = (d: string) => new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold tracking-tight">Audit Logs</h1>
      <p className="text-sm text-muted-foreground">Complete history of all actions in your workspace.</p></div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Filter by action (e.g. auth.login)..." className="pl-9"
          value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4" />Audit Trail {data && <span className="text-muted-foreground font-normal text-sm">({data.total} entries)</span>}
        </CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading && <div className="p-4 space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>}
          {data?.items?.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Shield className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No audit log entries found.</p>
            </div>
          )}
          {data && data.items.length > 0 && (
            <div className="divide-y">
              {data.items.map(entry => (
                <div key={entry.id} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/40">
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge className={"border-0 text-xs " + (ACTION_COLORS[entry.action] ?? "bg-gray-100 text-gray-700")}>{entry.action}</Badge>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground truncate">{entry.actorType} · {entry.resourceType ?? "system"}</p>
                    </div>
                  </div>
                  <div className="shrink-0">
                    <p className="text-xs text-muted-foreground">{fmtDate(entry.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page} of {data.totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p-1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage(p => p+1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}