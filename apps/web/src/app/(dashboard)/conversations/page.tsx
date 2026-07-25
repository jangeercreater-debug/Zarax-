"use client";
import { MessageSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
export default function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Conversations</h1>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Call History</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-sm font-medium">Your call history will appear here once agents start receiving calls.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
