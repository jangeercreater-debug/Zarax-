"use client";
import { useState } from "react";
import { PhoneIncoming, PhoneOutgoing, Clock, MessageSquare, Search, Download } from "lucide-react";
import { useCallsFiltered } from "@/hooks/use-telephony";
import { useAgents } from "@/hooks/use-agents";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { CallRecord } from "@/lib/types";

function fmt(s: number | null): string {
  if (!s) return "—";
  const ms = s;
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  return m > 0 ? m + "m " + (sec % 60) + "s" : sec + "s";
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function exportCSV(items: CallRecord[]) {
  const headers = ["ID","Direction","From","To","Started","Duration","Turns","Status"];
  const rows = items.map(c => [
    c.id, c.direction, c.fromNumber ?? "", c.toNumber ?? "",
    c.startedAt, String(c.durationMs ?? ""), String(c.turnCount),
    c.endedAt ? (c.endReason ?? "completed") : "active"
  ]);
  const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "conversations.csv"; a.click();
  URL.revokeObjectURL(url);
}

export default function ConversationsPage() {
  const [search, setSearch] = useState("");
  const [agentId, setAgentId] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  const { data: agents } = useAgents();
  const { data, isLoading, isError } = useCallsFiltered({
    search: search || undefined,
    agentId: agentId === "all" ? undefined : agentId,
    status: status === "all" ? undefined : status,
    page,
    limit: 20,
  });

  const items = (data as { items?: CallRecord[] })?.items ?? (Array.isArray(data) ? (data as CallRecord[]) : []);
  const total = (data as { total?: number })?.total ?? items.length;
  const totalPages = (data as { totalPages?: number })?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Conversations</h1>
          <p className="text-sm text-muted-foreground">{total} total calls</p>
        </div>
        {items.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => exportCSV(items)}>
            <Download className="h-4 w-4 mr-2" />Export CSV
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by phone number..." className="pl-9"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={agentId} onValueChange={v => { setAgentId(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All agents" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All agents</SelectItem>
            {agents?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={v => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="All status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <Card><CardContent className="py-4 space-y-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-14 w-full" />)}
        </CardContent></Card>
      )}

      {isError && (
        <Card className="border-destructive/50">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Could not load call history. Please refresh.
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <Card><CardContent>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-sm font-medium">No conversations found</p>
            <p className="text-xs text-muted-foreground mt-1">Try adjusting your filters.</p>
          </div>
        </CardContent></Card>
      )}

      {items.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Call History</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {items.map((call: CallRecord) => (
                <div key={call.id} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/40">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                      {call.direction === "inbound" ? <PhoneIncoming className="h-4 w-4 text-green-600" /> : <PhoneOutgoing className="h-4 w-4 text-blue-600" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{call.fromNumber ?? "Unknown"} → {call.toNumber ?? "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">{fmtDate(call.startedAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />{fmt(call.durationMs)}
                    </span>
                    <span className="hidden sm:block text-xs text-muted-foreground">{call.turnCount} turns</span>
                    <Badge variant={call.endedAt ? "secondary" : "default"} className="text-xs">
                      {call.endedAt ? (call.endReason ?? "completed") : "active"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
