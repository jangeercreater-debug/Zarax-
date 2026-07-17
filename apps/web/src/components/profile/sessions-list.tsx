'use client';

import { Laptop, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

import { ClientApiError } from '@/lib/api-client';
import { useRevokeSession, useSessions } from '@/hooks/use-sessions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function isMobileUserAgent(userAgent: string | null): boolean {
  return Boolean(userAgent && /Mobile|Android|iPhone/i.test(userAgent));
}

function describeUserAgent(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  if (/iPhone/i.test(userAgent)) return 'iPhone';
  if (/Android/i.test(userAgent)) return 'Android device';
  if (/Macintosh/i.test(userAgent)) return 'Mac';
  if (/Windows/i.test(userAgent)) return 'Windows PC';
  return 'Browser';
}

export function SessionsList() {
  const { data: sessions, isLoading } = useSessions();
  const revokeSession = useRevokeSession();

  function handleRevoke(sessionId: string) {
    revokeSession.mutate(sessionId, {
      onSuccess: () => toast.success('Session revoked'),
      onError: (error) => {
        const message = error instanceof ClientApiError ? error.message : 'Please try again.';
        toast.error('Could not revoke session', { description: message });
      },
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sessions?.map((session) => {
        const Icon = isMobileUserAgent(session.userAgent) ? Smartphone : Laptop;
        return (
          <Card key={session.id}>
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{describeUserAgent(session.userAgent)}</p>
                    {session.isCurrent && <Badge variant="secondary">This device</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {session.ipAddress ?? 'Unknown location'} · Last active {formatDate(session.lastUsedAt)}
                  </p>
                </div>
              </div>
              {!session.isCurrent && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRevoke(session.id)}
                  disabled={revokeSession.isPending}
                >
                  Sign out
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
