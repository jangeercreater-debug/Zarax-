"use client";
import { PhoneIncoming, PhoneOutgoing, Clock, MessageSquare } from "lucide-react";
import { useCallHistory } from "@/hooks/use-telephony";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { CallRecord } from "@/lib/types";
function fmt(s: number | null): string {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  return m > 0 ? m + "m " + (s % 60) + "s" : s + "s";
}
function fmtDate(d: string): string {
  return new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
export default function ConversationsPage() {
  const { data: calls, isLoading, isError } = useCallHistory();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Conversations</h1>
        <p className="text-sm text-muted-foreground">Your full call history.</p>
      </div>
      {isLoading && (<Card><CardContent className="py-4 space-y-3">{[1,2,3,4].map((i) => (<Skeleton key={i} className="h-14 w-full" />))}</CardContent></Card>)}
      {isError && (<Card className="border-destructive/50"><CardContent className="py-8 text-center text-sm text-muted-foreground">Could not load call history.</CardContent></Card>)}
      {calls && calls.length === 0 && (
        <Card><CardContent>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-sm font-medium">No conversations yet</p>
          </div>
        </CardContent></Card>
      )}
      {calls && calls.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Call History</CardTitle></CardHeader>
          <CardContent className="p-0"><div className="divide-y">
            {calls.map((call: CallRecord) => (
              <div key={call.id} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/40">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                    {call.direction === "inbound" ? <PhoneIncoming className="h-4 w-4 text-green-600" /> : <PhoneOutgoing className="h-4 w-4 text-blue-600" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{call.fromNumber ?? "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">{fmtDate(call.startedAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-muted-foreground">{fmt(call.durationMs)}</span>
                  <Badge variant={call.endedAt ? "secondary" : "default"} className="text-xs">
                    {call.endedAt ? (call.endReason ?? "completed") : "active"}
                  </Badge>
                </div>
              </div>
            ))}
          </div></CardContent>
        </Card>
      )}
    </div>
  );
}