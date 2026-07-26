"use client";
import { useState } from "react";
import { useProfile, useUpdateProfile, useChangePassword } from "@/hooks/use-profile";
import { useSessions, useRevokeSession } from "@/hooks/use-sessions";
import { useMemberships } from "@/hooks/use-organizations";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function SettingsPage() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: sessions } = useSessions();
  const { data: orgs } = useMemberships();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const revokeSession = useRevokeSession();

  const [fullName, setFullName] = useState("");
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);

  const handleProfileSave = async () => {
    await updateProfile.mutateAsync({ fullName: fullName || profile?.fullName || "" });
    setProfileSuccess(true);
    setTimeout(() => setProfileSuccess(false), 3000);
  };

  const handlePasswordChange = async () => {
    setPwError(""); setPwSuccess(false);
    if (newPw !== confirmPw) { setPwError("Passwords do not match"); return; }
    if (newPw.length < 8) { setPwError("Password must be at least 8 characters"); return; }
    try {
      await changePassword.mutateAsync({ currentPassword: currentPw, newPassword: newPw });
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      setPwSuccess(true);
      setTimeout(() => setPwSuccess(false), 3000);
    } catch { setPwError("Current password is incorrect"); }
  };

  const fmtDate = (d: string) => new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account and workspace settings.</p>
      </div>
      <Tabs defaultValue="profile">
        <TabsList className="mb-4">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="organization">Organization</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Profile Information</CardTitle><CardDescription>Update your display name and account details.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {profileLoading ? <Skeleton className="h-10 w-full" /> : (
                <>
                  <div className="space-y-1">
                    <Label>Email</Label>
                    <Input value={profile?.email ?? ""} disabled className="bg-muted" />
                    <p className="text-xs text-muted-foreground">Email cannot be changed.</p>
                  </div>
                  <div className="space-y-1">
                    <Label>Full Name</Label>
                    <Input placeholder={profile?.fullName ?? "Your name"} value={fullName} onChange={e => setFullName(e.target.value)} />
                  </div>
                  <div className="flex items-center gap-3">
                    <Button onClick={handleProfileSave} disabled={updateProfile.isPending}>
                      {updateProfile.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                    {profileSuccess && <span className="text-sm text-green-600">Saved successfully!</span>}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Change Password</CardTitle><CardDescription>Update your account password.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label>Current Password</Label>
                <Input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>New Password</Label>
                <Input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Confirm New Password</Label>
                <Input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
              </div>
              {pwError && <p className="text-sm text-destructive">{pwError}</p>}
              {pwSuccess && <p className="text-sm text-green-600">Password changed successfully!</p>}
              <Button onClick={handlePasswordChange} disabled={changePassword.isPending}>
                {changePassword.isPending ? "Changing..." : "Change Password"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Active Sessions</CardTitle><CardDescription>Manage your active login sessions.</CardDescription></CardHeader>
            <CardContent className="p-0">
              {sessions && sessions.length > 0 ? (
                <div className="divide-y">
                  {sessions.map((s: { id: string; createdAt: string; lastActiveAt?: string; current?: boolean }) => (
                    <div key={s.id} className="flex items-center justify-between px-4 py-3 gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{s.current ? "Current Session" : "Session"}</p>
                        <p className="text-xs text-muted-foreground">Started {fmtDate(s.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {s.current && <Badge variant="outline" className="text-xs">Current</Badge>}
                        {!s.current && (
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive text-xs"
                            disabled={revokeSession.isPending} onClick={() => revokeSession.mutate(s.id)}>Revoke</Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-6 text-center">No active sessions found.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="permissions" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Role Permissions</CardTitle><CardDescription>What each role can do in your workspace.</CardDescription></CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { role: "OWNER", color: "bg-purple-100 text-purple-700", perms: ["Full access to everything", "Manage billing", "Delete workspace", "Manage members"] },
                  { role: "ADMIN", color: "bg-blue-100 text-blue-700", perms: ["Manage agents, workflows, telephony", "View & manage calls", "Manage team members", "Manage API keys"] },
                  { role: "MEMBER", color: "bg-green-100 text-green-700", perms: ["Create & manage calls", "View agents & workflows", "Execute workflows", "Manage knowledge base"] },
                  { role: "VIEWER", color: "bg-gray-100 text-gray-700", perms: ["Read-only access to agents", "View call history", "View workflows"] },
                ].map(({ role, color, perms }) => (
                  <div key={role} className="rounded-lg border p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className={"text-xs font-medium px-2 py-0.5 rounded-full " + color}>{role}</span>
                    </div>
                    <ul className="space-y-1">
                      {perms.map(p => <li key={p} className="text-sm text-muted-foreground flex items-center gap-2"><span className="text-green-500">✓</span>{p}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="organization" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Organization</CardTitle><CardDescription>Your workspace details.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {orgs && orgs.length > 0 ? orgs.map((org) => (
                <div key={org.tenantId} className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{org.tenantName}</p>
                    <p className="text-xs text-muted-foreground">Role: {org.role}</p>
                  </div>
                  <Badge variant="outline">{org.role}</Badge>
                </div>
              )) : <p className="text-sm text-muted-foreground">No organizations found.</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}