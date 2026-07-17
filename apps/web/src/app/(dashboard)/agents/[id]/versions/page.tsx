'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { useAgent, useAgentVersions } from '@/hooks/use-agents';
import { VersionHistory, VersionHistorySkeleton } from '@/components/agents/version-history';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function AgentVersionsPage() {
  const params = useParams<{ id: string }>();
  const { data: agent, isLoading: agentLoading } = useAgent(params.id);
  const { data: versions, isLoading: versionsLoading, isError } = useAgentVersions(params.id);

  const isLoading = agentLoading || versionsLoading;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href={`/agents/${params.id}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to agent
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Version history</h1>
        {agent && <p className="text-sm text-muted-foreground">{agent.name}</p>}
      </div>

      {isLoading && <VersionHistorySkeleton />}

      {isError && (
        <Card className="border-destructive/50">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Couldn&rsquo;t load version history.
          </CardContent>
        </Card>
      )}

      {agent && versions && (
        <VersionHistory agentId={params.id} currentVersion={agent.currentVersion} versions={versions} />
      )}
    </div>
  );
}
