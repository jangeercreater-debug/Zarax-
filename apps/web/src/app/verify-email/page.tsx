'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';

import { ClientApiError } from '@/lib/api-client';
import { useVerifyEmail } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const verifyEmail = useVerifyEmail();
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMessage('This verification link is missing its token.');
      return;
    }
    verifyEmail.mutate(token, {
      onSuccess: () => setStatus('success'),
      onError: (error) => {
        setStatus('error');
        setErrorMessage(error instanceof ClientApiError ? error.message : 'Please try again.');
      },
    });
    // Only run once, on mount — re-running on every render would re-submit the
    // single-use token and always fail the second time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          {status === 'pending' && <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />}
          {status === 'success' && <CheckCircle2 className="h-10 w-10 text-success" />}
          {status === 'error' && <XCircle className="h-10 w-10 text-destructive" />}
          <CardTitle className="text-xl">
            {status === 'pending' && 'Verifying your email…'}
            {status === 'success' && 'Email verified'}
            {status === 'error' && 'Verification failed'}
          </CardTitle>
          <CardDescription>
            {status === 'success' && 'Your email address has been confirmed.'}
            {status === 'error' && errorMessage}
          </CardDescription>
        </CardHeader>
        {status !== 'pending' && (
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/agents">Go to dashboard</Link>
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}
