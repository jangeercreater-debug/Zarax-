'use client';

import { useEffect, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { History, Play, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { ClientApiError } from '@/lib/api-client';
import type { WorkflowDefinition } from '@/lib/types';
import {
  useUpdateWorkflow,
  useUnpublishWorkflow,
  usePublishWorkflow,
  useWorkflow,
} from '@/hooks/use-workflows';
import { DeleteWorkflowDialog } from '@/components/workflows/delete-workflow-dialog';
import { ExecuteWorkflowDialog } from '@/components/workflows/execute-workflow-dialog';
import { ExecutionHistory } from '@/components/workflows/execution-history';
import { WorkflowCanvas } from '@/components/workflows/workflow-canvas';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function WorkflowEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: workflow, isLoading, isError } = useWorkflow(params.id);
  const updateWorkflow = useUpdateWorkflow(params.id);
  const publishWorkflow = usePublishWorkflow(params.id);
  const unpublishWorkflow = useUnpublishWorkflow(params.id);

  const [definition, setDefinition] = useState<WorkflowDefinition | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [executeDialogOpen, setExecuteDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    if (workflow && !definition) setDefinition(workflow.definition);
  }, [workflow, definition]);

  // Unsaved-changes warning — same pattern as the Agent builder (M7E).
  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (isDirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  function handleDefinitionChange(next: WorkflowDefinition) {
    setDefinition(next);
    setIsDirty(true);
  }

  function handleSaveDraft() {
    if (!definition) return;
    updateWorkflow.mutate(
      { definition },
      {
        onSuccess: () => {
          setIsDirty(false);
          toast.success('Draft saved');
        },
        onError: (error) => {
          const message = error instanceof ClientApiError ? error.message : 'Please try again.';
          toast.error('Could not save', { description: message });
        },
      },
    );
  }

  function handlePublishToggle(checked: boolean) {
    const mutation = checked ? publishWorkflow : unpublishWorkflow;
    mutation.mutate(undefined, {
      onSuccess: () => toast.success(checked ? 'Workflow published' : 'Reverted to draft'),
      onError: (error) => {
        const message = error instanceof ClientApiError ? error.message : 'Please try again.';
        toast.error(checked ? 'Could not publish' : 'Could not unpublish', { description: message });
      },
    });
  }

  function handleBackClick(event: MouseEvent) {
    if (isDirty && !confirm('You have unsaved changes. Leave without saving?')) {
      event.preventDefault();
    }
  }

  if (isLoading || !definition) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[70vh] w-full" />
      </div>
    );
  }

  if (isError || !workflow) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Couldn&rsquo;t load this workflow.{' '}
        <button className="underline" onClick={() => router.push('/workflows')}>
          Back to workflows
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/workflows" onClick={handleBackClick} className="text-sm text-muted-foreground hover:underline">
              Workflows
            </Link>
            <span className="text-sm text-muted-foreground">/</span>
            <h1 className="text-xl font-semibold tracking-tight">{workflow.name}</h1>
            <Badge variant={workflow.isActive ? 'success' : 'secondary'}>
              {workflow.isActive ? 'Published' : 'Draft'}
            </Badge>
            {isDirty && (
              <Badge variant="outline" className="text-amber-600 dark:text-amber-400">
                Unsaved changes
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">v{workflow.currentVersion}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-md border px-3 py-1.5">
            <span className="text-sm">Published</span>
            <Switch
              checked={workflow.isActive}
              onCheckedChange={handlePublishToggle}
              disabled={publishWorkflow.isPending || unpublishWorkflow.isPending}
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => setExecuteDialogOpen(true)}>
            <Play className="mr-2 h-4 w-4" />
            Test workflow
          </Button>
          <Button size="sm" onClick={handleSaveDraft} disabled={!isDirty || updateWorkflow.isPending}>
            {updateWorkflow.isPending ? 'Saving…' : 'Save draft'}
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

      <Tabs defaultValue="editor">
        <TabsList>
          <TabsTrigger value="editor">Editor</TabsTrigger>
          <TabsTrigger value="history">
            <History className="mr-2 h-4 w-4" />
            Execution history
          </TabsTrigger>
        </TabsList>

        <TabsContent value="editor">
          <WorkflowCanvas definition={definition} onChange={handleDefinitionChange} />
          <p className="mt-2 text-xs text-muted-foreground">
            Publishing requires at least one trigger node and one end node.
          </p>
        </TabsContent>

        <TabsContent value="history">
          <ExecutionHistory workflowId={workflow.id} />
        </TabsContent>
      </Tabs>

      <ExecuteWorkflowDialog workflowId={workflow.id} open={executeDialogOpen} onOpenChange={setExecuteDialogOpen} />

      <DeleteWorkflowDialog
        workflowId={workflow.id}
        workflowName={workflow.name}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onDeleted={() => router.push('/workflows')}
      />
    </div>
  );
}
