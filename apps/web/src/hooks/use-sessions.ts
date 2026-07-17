'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { clientRequest } from '@/lib/api-client';
import type { Session } from '@/lib/types';

const sessionsKey = ['sessions'] as const;

export function useSessions() {
  return useQuery({
    queryKey: sessionsKey,
    queryFn: () => clientRequest<Session[]>('/users/me/sessions'),
  });
}

export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      clientRequest<{ success: true }>(`/users/me/sessions/${sessionId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionsKey });
    },
  });
}
