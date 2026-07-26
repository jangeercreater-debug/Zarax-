"use client";
import { useQuery } from "@tanstack/react-query";
import { clientRequest } from "@/lib/api-client";

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorType: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  createdAt: string;
}

export function useAuditLogs(params: { action?: string; page?: number; limit?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.action) qs.set("action", params.action);
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  return useQuery({
    queryKey: ["audit-logs", params],
    queryFn: () => clientRequest<{ items: AuditLogEntry[]; total: number; page: number; totalPages: number }>("/audit-logs?" + qs.toString()),
  });
}
