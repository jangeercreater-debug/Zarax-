'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { ClientApiError } from '@/lib/api-client';
import { useExecuteWorkflow } from '@/hooks/use-workflow-executions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface ExecuteWorkflowDialogProps {
  workflowId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExecuteWorkflowDialog({ workflowId, open, onOpenChange }: ExecuteWorkflowDialogProps) {
  const [message, setMessage] = useState('');
  const executeWorkflow = useExecuteWorkflow(workflowId);

  function handleRun() {
    executeWorkflow.mutate(
      { input: { message } },
      {
        onSuccess: () => {
          toast.success('Workflow run started', {
            description: 'Check the Execution history tab to follow along.',
          });
          onOpenChange(false);
          setMessage('');
        },
        onError: (error) => {
          const description = error instanceof ClientApiError ? error.message : 'Please try again.';
          toast.error('Could not start the run', { description });
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Test workflow</DialogTitle>
          <DialogDescription>
            Runs this workflow now, whether it&rsquo;s published or still a draft. Available as{' '}
            <code className="rounded bg-muted px-1 text-xs">{'{{trigger.message}}'}</code> to the first node.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Trigger message (optional)</Label>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What's your return policy?" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleRun} disabled={executeWorkflow.isPending}>
            {executeWorkflow.isPending ? 'Starting…' : 'Run now'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
