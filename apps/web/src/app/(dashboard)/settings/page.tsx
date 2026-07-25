"use client";
import { Settings } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
export default function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Workspace Settings</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Settings className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-sm font-medium">Notifications, security, and workspace preferences.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
