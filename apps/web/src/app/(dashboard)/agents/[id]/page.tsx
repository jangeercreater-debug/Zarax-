'use client';

import { useEffect, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Copy, History, Play, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { ClientApiError } from '@/lib/api-client';
import {
  useAgent,
  useCloneAgent,
  usePublishAgent,
  useUnpublishAgent,
  useUpdateAgent,
} from '@/hooks/use-agents';
import { AgentForm, agentToFormValues, type AgentFormValues } from '@/components/agents/agent-form';
import { DeleteAgentDialog } from '@/components/agents/delete-agent-dialog';
import { LiveConfigPreview } from '@/components/agents/live-config-preview';
import { TestAgentDialog } from '@/components/agents/test-agent-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';

export default function EditAgentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: agent, isLoading, isError } = useAgent(params.id);
  const updateAgent = useUpdateAgent(params.id);
  const publishAgent = usePublishAgent(params.id);
  const unpublishAgent = useUnpublishAgent(params.id);
  const cloneAgent = useCloneAgent();

  const [isDirty, setIsDirty] = useState(false);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Unsaved-changes warning — covers tab close/refresh. Next.js's App Router has no
  // built-in in-app navigation blocker (that's a react-router concept); in-app
  // navigation is guarded separately below via a confirm on the "Back" link.
  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!isDirty) return;
      event.preventDefault();
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  function handleBackClick(event: MouseEvent) {
    if (isDirty && !window.confirm('You have unsaved changes. Leave without saving?')) {
      event.preventDefault();
    }
  }

  function handleSubmit(values: AgentFormValues) {
    updateAgent.mutate(
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
          wakeWordEnabled: values.wakeWordEnabled,
          maxToolIterations: values.maxToolIterations,
          enabledTools: values.enabledTools,
        },
      },
      {
        onSuccess: () => {
          toast.success('Agent updated', {
            description: 'Changes to the prompt/config created a new version.',
          });
          setIsDirty(false);
        },
        onError: (error) => {
          const message = error instanceof ClientApiError ? error.message : 'Please try again.';
          toast.error('Could not update agent', { description: message });
        },
      },
    );
  }

  function handleTogglePublish(checked: boolean) {
    const mutation = checked ? publishAgent : unpublishAgent;
    mutation.mutate(undefined, {
      onSuccess: () => {
        toast.success(checked ? 'Agent published' : 'Agent unpublished', {
          description: checked
            ? 'This agent can now take real calls.'
            : 'This agent is now a draft and cannot take real calls.',
        });
      },
      onError: (error) => {
        const message = error instanceof ClientApiError ? error.message : 'Please try again.';
        toast.error(checked ? 'Could not publish' : 'Could not unpublish', { description: message });
      },
    });
  }

  function handleDuplicate() {
    cloneAgent.mutate(params.id, {
      onSuccess: (clone) => {
        toast.success('Agent duplicated', { description: `Created "${clone.name}".` });
        router.push(`/agents/${clone.id}`);
      },
      onError: (error) => {
        const message = error instanceof ClientApiError ? error.message : 'Please try again.';
        toast.error('Could not duplicate agent', { description: message });
      },
    });
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
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
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{agent.name}</h1>
            <Badge variant={agent.isActive ? 'success' : 'secondary'}>
              {agent.isActive ? 'Published' : 'Draft'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">Version {agent.currentVersion}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setTestDialogOpen(true)}>
            <Play className="mr-2 h-4 w-4" />
            Test agent
          </Button>
          <Button variant="outline" size="sm" onClick={handleDuplicate} disabled={cloneAgent.isPending}>
            <Copy className="mr-2 h-4 w-4" />
            Duplicate
          </Button>
          <Button variant="outline" size="sm" asChild onClick={handleBackClick}>
            <Link href={`/agents/${agent.id}/versions`}>
              <History className="mr-2 h-4 w-4" />
              Versions
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {isDirty && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-400">
          You have unsaved changes — remember to save before leaving this page.
        </div>
      )}

      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <p className="font-medium">{agent.isActive ? 'Published' : 'Draft'}</p>
            <p className="text-sm text-muted-foreground">
              {agent.isActive
                ? 'This agent can take real calls.'
                : 'Publish this agent once it’s ready to take real calls.'}
            </p>
          </div>
          <Switch
            checked={agent.isActive}
            onCheckedChange={handleTogglePublish}
            disabled={publishAgent.isPending || unpublishAgent.isPending}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agent details</CardTitle>
          <CardDescription>Changes to the prompt or model create a new version automatically.</CardDescription>
        </CardHeader>
        <CardContent>
          <AgentForm
            defaultValues={agentToFormValues(agent)}
            onSubmit={handleSubmit}
            onDirtyChange={setIsDirty}
            isSubmitting={updateAgent.isPending}
            submitLabel="Save changes"
            renderPreview={(values) => <LiveConfigPreview values={values} />}
          />
        </CardContent>
      </Card>

      <TestAgentDialog
        agentId={agent.id}
        agentName={agent.name}
        open={testDialogOpen}
        onOpenChange={setTestDialogOpen}
      />

      <DeleteAgentDialog
        agentId={agent.id}
        agentName={agent.name}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onDeleted={() => router.push('/agents')}
      />
    </div>
  );
}
