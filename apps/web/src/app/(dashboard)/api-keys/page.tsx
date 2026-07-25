"use client";
import { Key } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
export default function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">API Keys</h1>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Your API Keys</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Key className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-sm font-medium">API key management coming soon.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
