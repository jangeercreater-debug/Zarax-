"use client";
import { Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
export default function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Team Members</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-sm font-medium">Invite members, assign roles, and manage permissions.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
