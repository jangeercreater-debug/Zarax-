'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { clientRequest } from '@/lib/api-client';
import type { Tenant } from '@/lib/types';

export function useSignup() {
  const router = useRouter();
  return useMutation({
    mutationFn: (input: { email: string; password: string; fullName: string; tenantName: string; tenantSlug: string }) =>
      clientRequest<{ success: true }>('/auth/signup', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      router.push('/agents');
      router.refresh();
    },
  });
}

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

export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) =>
      clientRequest<{ success: true; devOnlyResetLink?: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
  });
}

export function useResetPassword() {
  const router = useRouter();
  return useMutation({
    mutationFn: (input: { token: string; newPassword: string }) =>
      clientRequest<{ success: true }>('/auth/reset-password', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      router.push('/login');
    },
  });
}

export function useVerifyEmail() {
  return useMutation({
    mutationFn: (token: string) =>
      clientRequest<{ success: true }>('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) }),
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: () =>
      clientRequest<{ success: true; devOnlyVerificationLink?: string }>('/auth/resend-verification', {
        method: 'POST',
      }),
  });
}

export function useCurrentTenant() {
  return useQuery({
    queryKey: ['tenant', 'me'],
    queryFn: () => clientRequest<Tenant>('/tenants/me'),
    retry: false,
  });
}
