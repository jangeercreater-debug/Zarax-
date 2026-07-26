"use client";
import { useQuery } from "@tanstack/react-query";
import { clientRequest } from "@/lib/api-client";

export interface ServiceStatus {
  name: string;
  url: string;
  status: "healthy" | "degraded" | "down";
  latencyMs: number | null;
  checkedAt: string;
}

export interface SystemHealth {
  overall: "healthy" | "degraded" | "down";
  summary: { healthy: number; degraded: number; down: number; total: number };
  services: ServiceStatus[];
  checkedAt: string;
}

export function useSystemHealth() {
  return useQuery({
    queryKey: ["system", "health"],
    queryFn: () => clientRequest<SystemHealth>("/system/health"),
    refetchInterval: 30000,
    retry: 1,
  });
}
