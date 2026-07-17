'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { History } from 'lucide-react';
import { toast } from 'sonner';

import { ClientApiError } from '@/lib/api-client';
import { useAgent, useUpdateAgent } from '@/hooks/use-agents';
import { AgentForm, agentToFormValues, type AgentFormValues } from '@/components/agents/agent-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function EditAgentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: agent, isLoading, isError } = useAgent(params.id);
  const updateAgent = useUpdateAgent(params.id);

  function handleSubmit(values: AgentFormValues) {
    updateAgent.mutate(
      {
        name: values.name,
        config: {
          systemPrompt: values.systemPrompt || undefined,
          provider: values.provider,
          model: values.model || undefined,
          ragEnabled: values.ragEnabled,
          maxToolIterations: values.maxToolIterations,
        },
      },
      {
        onSuccess: () => {
          toast.success('Agent updated', {
            description: 'Changes to the prompt/config created a new version.',
          });
        },
        onError: (error) => {
          const message = error instanceof ClientApiError ? error.message : 'Please try again.';
          toast.error('Could not update agent', { description: message });
        },
      },
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (isError || !agent) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="border-destructive/50">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Couldn&rsquo;t load this agent.{' '}
            <button className="underline" onClick={() => router.push('/agents')}>
              Back to agents
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{agent.name}</h1>
          <p className="text-sm text-muted-foreground">Version {agent.currentVersion}</p>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/agents/${agent.id}/versions`}>
            <History className="mr-2 h-4 w-4" />
            Version history
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Agent details</CardTitle>
          <CardDescription>Changes to the prompt or model create a new version automatically.</CardDescription>
        </CardHeader>
        <CardContent>
          <AgentForm
            defaultValues={agentToFormValues(agent)}
            onSubmit={handleSubmit}
            isSubmitting={updateAgent.isPending}
            submitLabel="Save changes"
          />
        </CardContent>
      </Card>
    </div>
  );
}
