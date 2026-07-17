'use client';

import { useState } from 'react';
import Link from 'next/link';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { ClientApiError } from '@/lib/api-client';
import { useSignup } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

const signupSchema = z.object({
  fullName: z.string().min(1, 'Your name is required.').max(200),
  email: z.string().min(1, 'Email is required.').email('Enter a valid email address.'),
  password: z.string().min(10, 'Password must be at least 10 characters.').max(128),
  tenantName: z.string().min(2, 'Company name is required.').max(100),
  tenantSlug: z
    .string()
    .min(2, 'Workspace URL is required.')
    .max(63)
    .regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, and hyphens.'),
});

type SignupFormValues = z.infer<typeof signupSchema>;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function SignupPage() {
  const signup = useSignup();
  const [showPassword, setShowPassword] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { fullName: '', email: '', password: '', tenantName: '', tenantSlug: '' },
  });

  function onSubmit(values: SignupFormValues) {
    signup.mutate(values, {
      onError: (error) => {
        const message = error instanceof ClientApiError ? error.message : 'Please try again.';
        toast.error('Could not create your account', { description: message });
      },
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-semibold">
              Z
            </div>
            <span className="text-lg font-semibold tracking-tight">ZaraX</span>
          </div>
          <CardTitle className="text-xl">Create your account</CardTitle>
          <CardDescription>Set up your workspace in under a minute.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Your name</FormLabel>
                    <FormControl>
                      <Input placeholder="Jane Doe" autoComplete="name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Work email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="you@company.com" autoComplete="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          className="pr-9"
                          {...field}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormDescription>At least 10 characters.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tenantName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Acme Corp"
                        {...field}
                        onChange={(e) => {
                          field.onChange(e);
                          if (!slugTouched) {
                            form.setValue('tenantSlug', slugify(e.target.value));
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tenantSlug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Workspace URL</FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">zarax.app/</span>
                        <Input
                          placeholder="acme-corp"
                          {...field}
                          onChange={(e) => {
                            setSlugTouched(true);
                            field.onChange(slugify(e.target.value));
                          }}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={signup.isPending}>
                {signup.isPending ? 'Creating account…' : 'Create account'}
              </Button>
            </form>
          </Form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-foreground hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
