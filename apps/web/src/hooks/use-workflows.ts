'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { clientRequest } from '@/lib/api-client';
import type { Workflow, WorkflowDefinition, WorkflowVersion } from '@/lib/types';

const workflowsKey = ['workflows'] as const;
const workflowKey = (id: string) => ['workflows', id] as const;
const workflowVersionsKey = (id: string) => ['workflows', id, 'versions'] as const;

export function useWorkflows() {
  return useQuery({
    queryKey: workflowsKey,
    queryFn: () => clientRequest<Workflow[]>('/workflows'),
  });
}

export function useWorkflow(id: string) {
  return useQuery({
    queryKey: workflowKey(id),
    queryFn: () => clientRequest<Workflow>(`/workflows/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; description?: string; definition?: WorkflowDefinition; publishOnCreate?: boolean }) =>
      clientRequest<Workflow>('/workflows', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workflowsKey });
    },
  });
}

export function useUpdateWorkflow(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name?: string; description?: string; definition?: WorkflowDefinition }) =>
      clientRequest<Workflow>(`/workflows/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workflowsKey });
      void queryClient.invalidateQueries({ queryKey: workflowKey(id) });
      void queryClient.invalidateQueries({ queryKey: workflowVersionsKey(id) });
    },
  });
}

export function useDeleteWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => clientRequest<void>(`/workflows/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workflowsKey });
    },
  });
}

export function usePublishWorkflow(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => clientRequest<Workflow>(`/workflows/${id}/publish`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workflowsKey });
      void queryClient.invalidateQueries({ queryKey: workflowKey(id) });
    },
  });
}

export function useUnpublishWorkflow(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => clientRequest<Workflow>(`/workflows/${id}/unpublish`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workflowsKey });
      void queryClient.invalidateQueries({ queryKey: workflowKey(id) });
    },
  });
}

export function useWorkflowVersions(id: string) {
  return useQuery({
    queryKey: workflowVersionsKey(id),
    queryFn: () => clientRequest<WorkflowVersion[]>(`/workflows/${id}/versions`),
    enabled: Boolean(id),
  });
}

export function useRollbackWorkflow(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (targetVersion: number) =>
      clientRequest<Workflow>(`/workflows/${id}/versions/${targetVersion}/rollback`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workflowsKey });
      void queryClient.invalidateQueries({ queryKey: workflowKey(id) });
      void queryClient.invalidateQueries({ queryKey: workflowVersionsKey(id) });
    },
  });
}
