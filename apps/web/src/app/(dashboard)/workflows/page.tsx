'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';

import { useWorkflows } from '@/hooks/use-workflows';
import { WorkflowList } from '@/components/workflows/workflow-list';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function WorkflowsPage() {
  const { data: workflows, isLoading, isError } = useWorkflows();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
          <p className="text-sm text-muted-foreground">Automations that trigger your agents, knowledge base, and more.</p>
        </div>
        <Button asChild>
          <Link href="/workflows/new">
            <Plus className="mr-2 h-4 w-4" />
            New workflow
          </Link>
        </Button>
      </div>

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      )}

      {isError && (
        <Card className="border-destructive/50">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Couldn&rsquo;t load your workflows. Please refresh the page.
          </CardContent>
        </Card>
      )}

      {workflows && <WorkflowList workflows={workflows} />}
    </div>
  );
}
