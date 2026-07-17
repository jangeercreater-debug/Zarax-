'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { ClientApiError } from '@/lib/api-client';
import { useResendVerification } from '@/hooks/use-auth';
import { useUpdateProfile } from '@/hooks/use-profile';
import type { Profile } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const profileFormSchema = z.object({
  fullName: z.string().min(1, 'Name is required.').max(200),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

export function ProfileForm({ profile }: { profile: Profile }) {
  const updateProfile = useUpdateProfile();
  const resendVerification = useResendVerification();

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: { fullName: profile.fullName ?? '' },
  });

  function onSubmit(values: ProfileFormValues) {
    updateProfile.mutate(values, {
      onSuccess: () => toast.success('Profile updated'),
      onError: (error) => {
        const message = error instanceof ClientApiError ? error.message : 'Please try again.';
        toast.error('Could not update profile', { description: message });
      },
    });
  }

  function handleResendVerification() {
    resendVerification.mutate(undefined, {
      onSuccess: (result) => {
        toast.success('Verification email sent');
        if (result.devOnlyVerificationLink) {
          toast.info('Dev mode: no email provider configured', {
            description: result.devOnlyVerificationLink,
            duration: 15000,
          });
        }
      },
      onError: (error) => {
        const message = error instanceof ClientApiError ? error.message : 'Please try again.';
        toast.error('Could not resend verification email', { description: message });
      },
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Email</Label>
        <div className="flex items-center gap-2">
          <Input value={profile.email} disabled className="max-w-sm" />
          {profile.emailVerified ? (
            <Badge variant="success">Verified</Badge>
          ) : (
            <Badge variant="secondary">Unverified</Badge>
          )}
        </div>
        {!profile.emailVerified && (
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-sm"
            onClick={handleResendVerification}
            disabled={resendVerification.isPending}
          >
            {resendVerification.isPending ? 'Sending…' : 'Resend verification email'}
          </Button>
        )}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="fullName"
            render={({ field }) => (
              <FormItem className="max-w-sm">
                <FormLabel>Full name</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={updateProfile.isPending}>
            {updateProfile.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </form>
      </Form>
    </div>
  );
}
