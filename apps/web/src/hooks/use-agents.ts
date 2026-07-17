'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { clientRequest } from '@/lib/api-client';
import type { Agent, AgentConfig, AgentVersion } from '@/lib/types';

const agentsKey = ['agents'] as const;
const agentKey = (id: string) => ['agents', id] as const;
const agentVersionsKey = (id: string) => ['agents', id, 'versions'] as const;

export function useAgents() {
  return useQuery({
    queryKey: agentsKey,
    queryFn: () => clientRequest<Agent[]>('/agents'),
  });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: agentKey(id),
    queryFn: () => clientRequest<Agent>(`/agents/${id}`),
    enabled: Boolean(id),
  });
}

export function useAgentVersions(id: string) {
  return useQuery({
    queryKey: agentVersionsKey(id),
    queryFn: () => clientRequest<AgentVersion[]>(`/agents/${id}/versions`),
    enabled: Boolean(id),
  });
}

export function useCreateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; config?: AgentConfig }) =>
      clientRequest<Agent>('/agents', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agentsKey });
    },
  });
}

export function useUpdateAgent(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name?: string; config?: AgentConfig }) =>
      clientRequest<Agent>(`/agents/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agentsKey });
      void queryClient.invalidateQueries({ queryKey: agentKey(id) });
      void queryClient.invalidateQueries({ queryKey: agentVersionsKey(id) });
    },
  });
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => clientRequest<void>(`/agents/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agentsKey });
    },
  });
}

export function useRollbackAgent(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (targetVersion: number) =>
      clientRequest<Agent>(`/agents/${id}/versions/${targetVersion}/rollback`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agentsKey });
      void queryClient.invalidateQueries({ queryKey: agentKey(id) });
      void queryClient.invalidateQueries({ queryKey: agentVersionsKey(id) });
    },
  });
}
