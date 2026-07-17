'use client';

import { useQuery } from '@tanstack/react-query';

import { clientRequest } from '@/lib/api-client';
import type { AgentFeatureFlag, ToolCatalogEntry } from '@/lib/types';

export function useToolsCatalog() {
  return useQuery({
    queryKey: ['agents', 'tools-catalog'],
    queryFn: () => clientRequest<ToolCatalogEntry[]>('/agents/tools-catalog'),
    staleTime: 5 * 60_000, // the tool catalog changes rarely — no need to refetch often
  });
}

export function useAgentFeatureFlags() {
  return useQuery({
    queryKey: ['agents', 'feature-flags'],
    queryFn: () => clientRequest<AgentFeatureFlag[]>('/agents/feature-flags'),
    staleTime: 60_000,
  });
}
