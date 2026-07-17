'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { ClientApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { AgentVersion } from '@/lib/types';
import { useRollbackAgent } from '@/hooks/use-agents';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function PromptPreview({ config }: { config: AgentVersion['config'] }) {
  if (!config.systemPrompt) {
    return <p className="text-sm italic text-muted-foreground">No system prompt set.</p>;
  }
  return (
    <p className="line-clamp-2 font-mono text-xs text-muted-foreground">{config.systemPrompt}</p>
  );
}

export function VersionHistorySkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}

interface VersionHistoryProps {
  agentId: string;
  currentVersion: number;
  versions: AgentVersion[];
}

export function VersionHistory({ agentId, currentVersion, versions }: VersionHistoryProps) {
  const [rollbackTarget, setRollbackTarget] = useState<AgentVersion | null>(null);
  const rollback = useRollbackAgent(agentId);

  function handleConfirmRollback() {
    if (!rollbackTarget) return;
    rollback.mutate(rollbackTarget.version, {
      onSuccess: () => {
        toast.success(`Rolled back to v${rollbackTarget.version}`, {
          description: 'A new version was created matching that snapshot — history is preserved.',
        });
        setRollbackTarget(null);
      },
      onError: (error) => {
        const message = error instanceof ClientApiError ? error.message : 'Please try again.';
        toast.error('Rollback failed', { description: message });
      },
    });
  }

  return (
    <>
      <ol className="relative space-y-6 border-l-2 border-border pl-6">
        {versions.map((version) => {
          const isCurrent = version.version === currentVersion;
          return (
            <li key={version.id} className="relative">
              <span
                className={cn(
                  'absolute -left-[31px] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2',
                  isCurrent ? 'border-primary bg-primary' : 'border-border bg-background',
                )}
              />
              <Card className={cn(isCurrent && 'border-primary/50')}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">Version {version.version}</span>
                      {isCurrent && <Badge>Current</Badge>}
                      <span className="text-xs text-muted-foreground">
                        {formatDate(version.createdAt)}
                      </span>
                    </div>
                    <PromptPreview config={version.config} />
                  </div>
                  {!isCurrent && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => setRollbackTarget(version)}
                    >
                      Roll back to this version
                    </Button>
                  )}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ol>

      <Dialog open={Boolean(rollbackTarget)} onOpenChange={(open) => !open && setRollbackTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Roll back to version {rollbackTarget?.version}?</DialogTitle>
            <DialogDescription>
              This creates a new version (v{currentVersion + 1}) matching version{' '}
              {rollbackTarget?.version}&rsquo;s configuration. Nothing is deleted — the current
              version stays in history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRollbackTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmRollback} disabled={rollback.isPending}>
              {rollback.isPending ? 'Rolling back…' : 'Confirm rollback'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
