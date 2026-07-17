'use client';

import { useProfile } from '@/hooks/use-profile';
import { ChangePasswordForm } from '@/components/profile/change-password-form';
import { ProfileForm } from '@/components/profile/profile-form';
import { SessionsList } from '@/components/profile/sessions-list';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function ProfilePage() {
  const { data: profile, isLoading } = useProfile();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile & security</h1>
        <p className="text-sm text-muted-foreground">Manage your account details and active sessions.</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Your account details.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading && <Skeleton className="h-40 w-full" />}
              {profile && <ProfileForm profile={profile} />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Password</CardTitle>
              <CardDescription>Changing your password signs out every other session.</CardDescription>
            </CardHeader>
            <CardContent>
              <ChangePasswordForm />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions">
          <Card>
            <CardHeader>
              <CardTitle>Active sessions</CardTitle>
              <CardDescription>Devices currently signed in to your account.</CardDescription>
            </CardHeader>
            <CardContent>
              <SessionsList />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
