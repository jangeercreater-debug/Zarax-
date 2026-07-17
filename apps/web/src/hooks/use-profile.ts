'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { clientRequest } from '@/lib/api-client';
import type { Profile } from '@/lib/types';

const profileKey = ['profile', 'me'] as const;

export function useProfile() {
  return useQuery({
    queryKey: profileKey,
    queryFn: () => clientRequest<Profile>('/users/me'),
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { fullName?: string }) =>
      clientRequest<Profile>('/users/me', { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: profileKey });
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      clientRequest<{ success: true }>('/users/me/change-password', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  });
}
