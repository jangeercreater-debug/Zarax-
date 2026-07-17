'use client';

import { useState } from 'react';
import Link from 'next/link';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { ClientApiError } from '@/lib/api-client';
import { useForgotPassword } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

const forgotPasswordSchema = z.object({
  email: z.string().min(1, 'Email is required.').email('Enter a valid email address.'),
});

type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const forgotPassword = useForgotPassword();
  const [submitted, setSubmitted] = useState(false);
  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  function onSubmit(values: ForgotPasswordValues) {
    forgotPassword.mutate(values.email, {
      onSuccess: (result) => {
        setSubmitted(true);
        // Dev-only: no email provider is integrated yet, so the reset link is
        // surfaced here directly outside production so the flow stays fully testable.
        if (result.devOnlyResetLink) {
          toast.info('Dev mode: no email provider configured', {
            description: result.devOnlyResetLink,
            duration: 15000,
          });
        }
      },
      onError: (error) => {
        const message = error instanceof ClientApiError ? error.message : 'Please try again.';
        toast.error('Something went wrong', { description: message });
      },
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-xl">Forgot your password?</CardTitle>
          <CardDescription>
            {submitted
              ? "If an account exists for that email, we've sent a reset link."
              : "Enter your email and we'll send you a reset link."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!submitted && (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="you@company.com" autoComplete="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={forgotPassword.isPending}>
                  {forgotPassword.isPending ? 'Sending…' : 'Send reset link'}
                </Button>
              </form>
            </Form>
          )}

          <Button variant="ghost" asChild className="mt-4 w-full">
            <Link href="/login">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to sign in
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
