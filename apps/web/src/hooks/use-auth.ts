'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { clientRequest } from '@/lib/api-client';
import type { Tenant } from '@/lib/types';

export function useLogin() {
  const router = useRouter();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      clientRequest<{ success: true }>('/auth/login', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      router.push('/agents');
      router.refresh(); // re-evaluates middleware/session state for the new route
    },
  });
}

export function useLogout() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => clientRequest<{ success: true }>('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      queryClient.clear();
      router.push('/login');
      router.refresh();
    },
  });
}

export function useCurrentTenant() {
  return useQuery({
    queryKey: ['tenant', 'me'],
    queryFn: () => clientRequest<Tenant>('/tenants/me'),
    retry: false,
  });
}
