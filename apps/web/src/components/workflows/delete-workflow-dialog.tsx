'use client';

import { toast } from 'sonner';

import { ClientApiError } from '@/lib/api-client';
import { useDeleteWorkflow } from '@/hooks/use-workflows';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface DeleteWorkflowDialogProps {
  workflowId: string;
  workflowName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}

export function DeleteWorkflowDialog({ workflowId, workflowName, open, onOpenChange, onDeleted }: DeleteWorkflowDialogProps) {
  const deleteWorkflow = useDeleteWorkflow();

  function handleConfirm() {
    deleteWorkflow.mutate(workflowId, {
      onSuccess: () => {
        toast.success('Workflow deleted');
        onOpenChange(false);
        onDeleted?.();
      },
      onError: (error) => {
        const message = error instanceof ClientApiError ? error.message : 'Please try again.';
        toast.error('Could not delete workflow', { description: message });
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete &ldquo;{workflowName}&rdquo;?</DialogTitle>
          <DialogDescription>
            This workflow stops running immediately. Its configuration and version history are kept, not
            permanently erased.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={deleteWorkflow.isPending}>
            {deleteWorkflow.isPending ? 'Deleting…' : 'Delete workflow'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
