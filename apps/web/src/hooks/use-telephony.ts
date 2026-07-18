'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clientRequest } from '@/lib/api-client';
import type { CallRecord, PhoneNumber } from '@/lib/types';

const phoneKey = ['telephony', 'phone-numbers'] as const;
const callsKey = ['telephony', 'calls'] as const;

export function usePhoneNumbers() {
  return useQuery({ queryKey: phoneKey, queryFn: () => clientRequest<PhoneNumber[]>('/telephony/phone-numbers') });
}

export function useCreatePhoneNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { phoneNumber: string; friendlyName?: string; sipTrunkId?: string }) =>
      clientRequest<PhoneNumber>('/telephony/phone-numbers', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: phoneKey }),
  });
}

export function useAssignAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, agentId }: { id: string; agentId: string | null }) =>
      clientRequest<PhoneNumber>(`/telephony/phone-numbers/${id}/assign`, { method: 'POST', body: JSON.stringify({ agentId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: phoneKey }),
  });
}

export function useDeletePhoneNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => clientRequest<void>(`/telephony/phone-numbers/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: phoneKey }),
  });
}

export function useCallHistory() {
  return useQuery({ queryKey: callsKey, queryFn: () => clientRequest<CallRecord[]>('/telephony/calls') });
}

export function useActiveCalls() {
  return useQuery({
    queryKey: [...callsKey, 'active'],
    queryFn: () => clientRequest<CallRecord[]>('/telephony/calls/active'),
    refetchInterval: 5000, // poll every 5s while page is open
  });
}
