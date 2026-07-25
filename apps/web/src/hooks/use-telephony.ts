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

export interface CallFilters {
  search?: string;
  agentId?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedCalls {
  items: CallRecord[];
  total: number;
  page: number;
  totalPages: number;
}

export function useCallsFiltered(filters: CallFilters = {}) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.agentId) params.set("agentId", filters.agentId);
  if (filters.status) params.set("status", filters.status);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return useQuery({
    queryKey: [...callsKey, "filtered", filters],
    queryFn: () =>
      qs
        ? clientRequest<PaginatedCalls>("/telephony/calls?" + qs)
        : clientRequest<{ items: CallRecord[]; total: number; page: number; totalPages: number }>("/telephony/calls"),
  });
}
