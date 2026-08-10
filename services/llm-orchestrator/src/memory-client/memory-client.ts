import { Injectable } from "@nestjs/common";

const API_URL = process.env.API_SERVICE_URL ?? "http://localhost:3000";
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? "";

export interface MemoryItem {
  id: string;
  category: string;
  key: string | null;
  value: unknown;
  importance: number;
}

/** Talks to services/api's internal/memory endpoint (protected by the shared
 * INTERNAL_SERVICE_TOKEN via X-Internal-Token — no JWT/tenant-user session exists
 * mid-call, matching agent-config.client.ts's established pattern). */
@Injectable()
export class MemoryClient {

  async recall(tenantId: string, userId: string, query: string, limit = 5): Promise<MemoryItem[]> {
    try {
      const url = API_URL + "/v1/internal/memory/search?tenantId=" + encodeURIComponent(tenantId) +
        "&userId=" + encodeURIComponent(userId) +
        "&q=" + encodeURIComponent(query) +
        "&limit=" + limit;
      const res = await fetch(url, {
        headers: { "X-Internal-Token": INTERNAL_TOKEN },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      const json = await res.json() as { items?: MemoryItem[] };
      return json.items ?? [];
    } catch {
      return [];
    }
  }

  async remember(tenantId: string, userId: string, category: string, key: string | null, value: unknown, callId?: string, importance?: number, expiresInDays?: number): Promise<boolean> {
    try {
      const res = await fetch(API_URL + "/v1/internal/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Internal-Token": INTERNAL_TOKEN },
        body: JSON.stringify({ tenantId, userId, category, key, value, callId, importance, expiresInDays }),
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
