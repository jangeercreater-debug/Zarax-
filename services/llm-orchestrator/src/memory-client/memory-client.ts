import { Injectable } from "@nestjs/common";

const API_URL = process.env.API_SERVICE_URL ?? "http://localhost:3000";
const API_TOKEN = process.env.API_INTERNAL_SERVICE_TOKEN ?? "";

export interface MemoryItem {
  id: string;
  category: string;
  key: string | null;
  value: unknown;
  importance: number;
}

@Injectable()
export class MemoryClient {

  async recall(tenantId: string, userId: string, query: string): Promise<MemoryItem[]> {
    try {
      const res = await fetch(API_URL + "/v1/memory/search?q=" + encodeURIComponent(query), {
        headers: {
          "Authorization": "Bearer " + API_TOKEN,
          "X-Tenant-Id": tenantId,
          "X-User-Id": userId,
        },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      const json = await res.json() as { items?: MemoryItem[] };
      return json.items ?? [];
    } catch {
      return [];
    }
  }
}
