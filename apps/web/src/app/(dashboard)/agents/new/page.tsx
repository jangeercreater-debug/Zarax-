'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { ClientApiError } from '@/lib/api-client';
import { useCreateAgent } from '@/hooks/use-agents';
import { AgentForm, type AgentFormValues } from '@/components/agents/agent-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function NewAgentPage() {
  const router = useRouter();
  const createAgent = useCreateAgent();

  function handleSubmit(values: AgentFormValues) {
    createAgent.mutate(
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
        onSuccess: (agent) => {
          toast.success('Agent created', { description: `"${agent.name}" is ready to configure further.` });
          router.push(`/agents/${agent.id}`);
        },
        onError: (error) => {
          const message = error instanceof ClientApiError ? error.message : 'Please try again.';
          toast.error('Could not create agent', { description: message });
        },
      },
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New agent</h1>
        <p className="text-sm text-muted-foreground">Set up a new voice agent.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Agent details</CardTitle>
          <CardDescription>You can change all of this later.</CardDescription>
        </CardHeader>
        <CardContent>
          <AgentForm
            onSubmit={handleSubmit}
            isSubmitting={createAgent.isPending}
            submitLabel="Create agent"
          />
        </CardContent>
      </Card>
    </div>
  );
}
