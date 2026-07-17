'use client';

import { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, XCircle } from 'lucide-react';

import { useWorkflowExecutions } from '@/hooks/use-workflow-executions';
import type { WorkflowExecution } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const STATUS_CONFIG: Record<WorkflowExecution['status'], { label: string; variant: 'secondary' | 'success' | 'destructive'; Icon: typeof Loader2 }> = {
  pending: { label: 'Pending', variant: 'secondary', Icon: Loader2 },
  running: { label: 'Running', variant: 'secondary', Icon: Loader2 },
  completed: { label: 'Completed', variant: 'success', Icon: CheckCircle2 },
  failed: { label: 'Failed', variant: 'destructive', Icon: XCircle },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function ExecutionRow({ execution }: { execution: WorkflowExecution }) {
  const [expanded, setExpanded] = useState(false);
  const { label, variant, Icon } = STATUS_CONFIG[execution.status];
  const isInFlight = execution.status === 'pending' || execution.status === 'running';

  return (
    <Card>
      <CardContent className="p-4">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <div className="flex items-center gap-2">
            <Badge variant={variant} className="gap-1">
              <Icon className={isInFlight ? 'h-3 w-3 animate-spin' : 'h-3 w-3'} />
              {label}
            </Badge>
            <span className="text-xs text-muted-foreground">{formatDate(execution.startedAt)}</span>
            <span className="text-xs capitalize text-muted-foreground">· {execution.triggerType}</span>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {execution.errorMessage && (
          <p className="mt-2 text-xs text-destructive">{execution.errorMessage}</p>
        )}

        {expanded && (
          <div className="mt-4 space-y-2 border-t pt-4">
            {execution.nodeExecutions.length === 0 && (
              <p className="text-xs text-muted-foreground">No nodes have run yet.</p>
            )}
            {execution.nodeExecutions.map((node, i) => (
              <div key={i} className="rounded-md border p-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{node.nodeType}</span>
                  <Badge variant={node.status === 'failed' ? 'destructive' : 'secondary'} className="text-[10px]">
                    {node.status}
                  </Badge>
                </div>
                {node.errorMessage && <p className="mt-1 text-destructive">{node.errorMessage}</p>}
                <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-[10px]">
                  {JSON.stringify(node.output, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ExecutionHistory({ workflowId }: { workflowId: string }) {
  const { data: executions, isLoading, isError } = useWorkflowExecutions(workflowId);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Couldn&rsquo;t load execution history.
        </CardContent>
      </Card>
    );
  }

  if (!executions || executions.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No runs yet — use &ldquo;Test workflow&rdquo; to run it for the first time.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {executions.map((execution) => (
        <ExecutionRow key={execution.id} execution={execution} />
      ))}
    </div>
  );
}
