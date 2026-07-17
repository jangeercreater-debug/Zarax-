'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { clientRequest } from '@/lib/api-client';
import type { WorkflowExecution } from '@/lib/types';

const executionsKey = (workflowId: string) => ['workflows', workflowId, 'executions'] as const;

export function useExecuteWorkflow(workflowId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { input?: Record<string, unknown> } = {}) =>
      clientRequest<WorkflowExecution>(`/workflows/${workflowId}/execute`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: executionsKey(workflowId) });
    },
  });
}

export function useWorkflowExecutions(workflowId: string) {
  return useQuery({
    queryKey: executionsKey(workflowId),
    queryFn: () => clientRequest<WorkflowExecution[]>(`/workflows/${workflowId}/executions`),
    enabled: Boolean(workflowId),
    // Polls while any run is still in flight — same pattern as the knowledge base's
    // document-processing status polling.
    refetchInterval: (query) => {
      const executions = query.state.data;
      const stillRunning = executions?.some((e) => e.status === 'pending' || e.status === 'running');
      return stillRunning ? 2000 : false;
    },
  });
}

export function useWorkflowExecution(workflowId: string, executionId: string) {
  return useQuery({
    queryKey: ['workflows', workflowId, 'executions', executionId],
    queryFn: () => clientRequest<WorkflowExecution>(`/workflows/${workflowId}/executions/${executionId}`),
    enabled: Boolean(workflowId) && Boolean(executionId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'pending' || status === 'running' ? 2000 : false;
    },
  });
}
