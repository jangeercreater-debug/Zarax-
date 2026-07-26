"use client";
import { Users, Trash2 } from "lucide-react";
import { useTeamMembers, useUpdateMemberRole, useRemoveMember } from "@/hooks/use-team";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ROLES = ["OWNER","ADMIN","MEMBER","VIEWER"];
const ROLE_COLORS: Record<string,string> = { OWNER:"bg-purple-100 text-purple-700", ADMIN:"bg-blue-100 text-blue-700", MEMBER:"bg-green-100 text-green-700", VIEWER:"bg-gray-100 text-gray-700" };

export default function TeamPage() {
  const { data: members, isLoading } = useTeamMembers();
  const updateRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="text-sm text-muted-foreground">Manage your workspace members and their roles.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Members ({members?.length ?? 0})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading && <div className="p-4 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>}
          {members && members.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No team members found.</p>
            </div>
          )}
          {members && members.length > 0 && (
            <div className="divide-y">
              {members.map(m => (
                <div key={m.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
                      {(m.fullName ?? m.email).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{m.fullName ?? m.email}</p>
                      <p className="text-xs text-muted-foreground">{m.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {m.role === "OWNER" ? (
                      <Badge className={ROLE_COLORS[m.role] + " border-0"}>{m.role}</Badge>
                    ) : (
                      <Select defaultValue={m.role} onValueChange={role => updateRole.mutate({ id: m.id, role })}>
                        <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ROLES.filter(r => r !== "OWNER").map(r => <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                    {m.role !== "OWNER" && (
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-8 w-8"
                        disabled={removeMember.isPending} onClick={() => removeMember.mutate(m.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Invite Member</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-4 text-center">Member invitation via email coming soon. Currently members can join by signing up with your organization.</p>
        </CardContent>
      </Card>
    </div>
  );
}