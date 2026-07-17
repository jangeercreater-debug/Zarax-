'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { ClientApiError } from '@/lib/api-client';
import type { WorkflowDefinition } from '@/lib/types';
import { useCreateWorkflow } from '@/hooks/use-workflows';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

/** Every new workflow starts with a trigger and an end node already placed and
 * connected — an empty canvas with neither would be a confusing blank slate, and
 * every workflow needs both to ever publish successfully anyway (see
 * services/api's WorkflowsService.publish()). */
const STARTER_DEFINITION: WorkflowDefinition = {
  nodes: [
    { id: 'trigger-1', type: 'trigger', position: { x: 60, y: 150 }, data: { eventType: 'manual' }, label: 'Trigger' },
    { id: 'end-1', type: 'end', position: { x: 420, y: 150 }, data: {}, label: 'End' },
  ],
  edges: [{ id: 'e-trigger-end', source: 'trigger-1', target: 'end-1' }],
};

export default function NewWorkflowPage() {
  const router = useRouter();
  const createWorkflow = useCreateWorkflow();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    createWorkflow.mutate(
      { name, description: description || undefined, definition: STARTER_DEFINITION },
      {
        onSuccess: (workflow) => {
          toast.success('Workflow created as a draft');
          router.push(`/workflows/${workflow.id}`);
        },
        onError: (error) => {
          const message = error instanceof ClientApiError ? error.message : 'Please try again.';
          toast.error('Could not create workflow', { description: message });
        },
      },
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New workflow</h1>
        <p className="text-sm text-muted-foreground">Give it a name — you&rsquo;ll build the automation next.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Workflow details</CardTitle>
          <CardDescription>You can change this later.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Post-call follow-up" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Sends a summary and checks the knowledge base for related articles."
              />
            </div>
            <Button type="submit" disabled={createWorkflow.isPending || !name.trim()}>
              {createWorkflow.isPending ? 'Creating…' : 'Create and continue'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
