'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';

import { useAgents } from '@/hooks/use-agents';
import { AgentList, AgentListSkeleton } from '@/components/agents/agent-list';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function AgentsPage() {
  const { data: agents, isLoading, isError } = useAgents();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
          <p className="text-sm text-muted-foreground">Manage the voice agents handling your calls.</p>
        </div>
        <Button asChild>
          <Link href="/agents/new">
            <Plus className="mr-2 h-4 w-4" />
            New agent
          </Link>
        </Button>
      </div>

      {isLoading && <AgentListSkeleton />}

      {isError && (
        <Card className="border-destructive/50">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Couldn&rsquo;t load your agents. Please refresh the page.
          </CardContent>
        </Card>
      )}

      {agents && <AgentList agents={agents} />}
    </div>
  );
}
