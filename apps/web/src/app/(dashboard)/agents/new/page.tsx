'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { ClientApiError } from '@/lib/api-client';
import { useCreateAgent } from '@/hooks/use-agents';
import { AgentForm, type AgentFormValues } from '@/components/agents/agent-form';
import { LiveConfigPreview } from '@/components/agents/live-config-preview';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function NewAgentPage() {
  const router = useRouter();
  const createAgent = useCreateAgent();

  function handleSubmit(values: AgentFormValues) {
    createAgent.mutate(
      {
        name: values.name,
        config: {
          description: values.description || undefined,
          systemPrompt: values.systemPrompt || undefined,
          welcomeMessage: values.welcomeMessage || undefined,
          provider: values.provider,
          model: values.model || undefined,
          temperature: values.temperature,
          maxTokens: values.maxTokens,
          responseStyle: values.responseStyle,
          interruptSensitivity: values.interruptSensitivity,
          voiceId: values.voiceId || undefined,
          sttModel: values.sttModel || undefined,
          ragEnabled: values.ragEnabled,
          maxToolIterations: values.maxToolIterations,
          enabledTools: values.enabledTools,
        },
      },
      {
        onSuccess: (agent) => {
          toast.success('Agent created as a draft', {
            description: `"${agent.name}" is ready to configure further — publish it once it's ready to take calls.`,
          });
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
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New agent</h1>
        <p className="text-sm text-muted-foreground">
          Set up a new voice agent. It&rsquo;s created as a draft — publish it once you&rsquo;re happy with it.
        </p>
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
            renderPreview={(values) => <LiveConfigPreview values={values} />}
          />
        </CardContent>
      </Card>
    </div>
  );
}
