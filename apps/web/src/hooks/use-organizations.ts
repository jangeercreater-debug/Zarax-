'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { clientRequest } from '@/lib/api-client';
import type { Membership } from '@/lib/types';

export function useMemberships() {
  return useQuery({
    queryKey: ['memberships'],
    queryFn: () => clientRequest<Membership[]>('/users/me/tenants'),
  });
}

export function useSwitchTenant() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tenantId: string) =>
      clientRequest<{ success: true }>('/auth/switch-tenant', {
        method: 'POST',
        body: JSON.stringify({ tenantId }),
      }),
    onSuccess: () => {
      queryClient.clear(); // every tenant-scoped query (agents, profile, ...) is now stale
      router.push('/agents');
      router.refresh();
    },
  });
}
