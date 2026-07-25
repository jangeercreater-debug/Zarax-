"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clientRequest } from "@/lib/api-client";

export interface ApiKey {
  id: string;
  label: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
}

export interface NewApiKey {
  key: string;
  keyPrefix: string;
  label: string;
  warning: string;
}

const KEY = ["api-keys"];

export function useApiKeys() {
  return useQuery({ queryKey: KEY, queryFn: () => clientRequest<ApiKey[]>("/api-keys") });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { label: string; scopes?: string[] }) =>
      clientRequest<NewApiKey>("/api-keys", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => clientRequest<{ success: boolean }>("/api-keys/" + id, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
