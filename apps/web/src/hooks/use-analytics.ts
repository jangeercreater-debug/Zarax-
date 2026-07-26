"use client";
import { useQuery } from "@tanstack/react-query";
import { clientRequest } from "@/lib/api-client";

export interface CallAnalytics {
  period: { days: number; since: string };
  calls: { total: number; completed: number; active: number; failed: number; avgDurationMs: number };
  topAgents: { agentId: string; agentName: string; callCount: number }[];
}

export interface UsageAnalytics {
  period: { days: number; since: string };
  totalCostUsd: number;
  breakdown: { category: string; provider: string; unit: string; quantity: number; costUsd: number; events: number }[];
}

export function useCallAnalytics(days = 30) {
  return useQuery({
    queryKey: ["analytics", "calls", days],
    queryFn: () => clientRequest<CallAnalytics>("/analytics/calls?days=" + days),
    refetchInterval: 60000,
  });
}

export function useUsageAnalytics(days = 30) {
  return useQuery({
    queryKey: ["analytics", "usage", days],
    queryFn: () => clientRequest<UsageAnalytics>("/analytics/usage?days=" + days),
    refetchInterval: 60000,
  });
}
