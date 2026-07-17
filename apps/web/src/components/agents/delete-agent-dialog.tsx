'use client';

import { toast } from 'sonner';

import { ClientApiError } from '@/lib/api-client';
import { useDeleteAgent } from '@/hooks/use-agents';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface DeleteAgentDialogProps {
  agentId: string;
  agentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}

export function DeleteAgentDialog({
  agentId,
  agentName,
  open,
  onOpenChange,
  onDeleted,
}: DeleteAgentDialogProps) {
  const deleteAgent = useDeleteAgent();

  function handleConfirm() {
    deleteAgent.mutate(agentId, {
      onSuccess: () => {
        toast.success('Agent deleted', { description: `"${agentName}" has been deleted.` });
        onOpenChange(false);
        onDeleted?.();
      },
      onError: (error) => {
        const message = error instanceof ClientApiError ? error.message : 'Please try again.';
        toast.error('Could not delete agent', { description: message });
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete &ldquo;{agentName}&rdquo;?</DialogTitle>
          <DialogDescription>
            This agent will stop taking calls immediately. Its configuration and version
            history are kept, not permanently erased — contact support if you need it restored.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={deleteAgent.isPending}>
            {deleteAgent.isPending ? 'Deleting…' : 'Delete agent'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
