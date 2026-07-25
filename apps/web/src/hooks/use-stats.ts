"use client";
import { useQuery } from "@tanstack/react-query";
import { clientRequest } from "@/lib/api-client";

export interface DashboardStats {
  totalCalls: number;
  recentCalls: number;
  activeCalls: number;
  totalAgents: number;
  activeAgents: number;
  totalDocuments: number;
}

export function useStats() {
  return useQuery({
    queryKey: ["stats"],
    queryFn: () => clientRequest<DashboardStats>("/stats"),
    refetchInterval: 30000,
  });
}
