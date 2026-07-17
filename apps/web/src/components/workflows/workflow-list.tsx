'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MoreVertical, Trash2 } from 'lucide-react';

import type { Workflow } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DeleteWorkflowDialog } from './delete-workflow-dialog';

function WorkflowActionsMenu({ workflow, onDelete }: { workflow: Workflow; onDelete: (w: Workflow) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions for ${workflow.name}`}>
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onDelete(workflow)} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function WorkflowEmptyState() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <p className="text-sm font-medium">No workflows yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Build an automation — trigger an AI agent, check your knowledge base, send a webhook, and more.
        </p>
        <Button asChild>
          <Link href="/workflows/new">Create your first workflow</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function WorkflowList({ workflows }: { workflows: Workflow[] }) {
  const [workflowToDelete, setWorkflowToDelete] = useState<Workflow | null>(null);

  if (workflows.length === 0) return <WorkflowEmptyState />;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {workflows.map((workflow) => (
          <Card key={workflow.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/workflows/${workflow.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-medium hover:underline">{workflow.name}</p>
                  {workflow.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{workflow.description}</p>
                  )}
                </Link>
                <WorkflowActionsMenu workflow={workflow} onDelete={setWorkflowToDelete} />
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant={workflow.isActive ? 'success' : 'secondary'}>
                  {workflow.isActive ? 'Published' : 'Draft'}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {workflow.definition.nodes.length} node{workflow.definition.nodes.length === 1 ? '' : 's'}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {workflowToDelete && (
        <DeleteWorkflowDialog
          workflowId={workflowToDelete.id}
          workflowName={workflowToDelete.name}
          open={Boolean(workflowToDelete)}
          onOpenChange={(open) => !open && setWorkflowToDelete(null)}
        />
      )}
    </>
  );
}
