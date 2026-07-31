import { Injectable } from "@nestjs/common";

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL ?? "http://localhost:3004";
const RAG_TOKEN = process.env.RAG_INTERNAL_SERVICE_TOKEN ?? "";

@Injectable()
export class MemoryVectorService {

  async embed(text: string): Promise<number[]> {
    const res = await fetch(RAG_SERVICE_URL + "/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + RAG_TOKEN,
      },
      body: JSON.stringify({ texts: [text] }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error("Embedding failed: " + res.status);
    const json = await res.json() as { embeddings: number[][] };
    return json.embeddings[0];
  }

  async storeVector(tenantId: string, memoryId: string, text: string, category: string, key: string | null): Promise<void> {
    const vector = await this.embed(text);
    const QDRANT_URL = process.env.QDRANT_URL ?? "http://localhost:6333";
    const collection = "tenant_" + tenantId + "_user_memory";

    // Ensure collection exists
    await fetch(QDRANT_URL + "/collections/" + collection, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vectors: { size: 1536, distance: "Cosine" } }),
    }).catch(() => undefined);

    // Upsert point
    await fetch(QDRANT_URL + "/collections/" + collection + "/points", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        points: [{
          id: memoryId,
          vector,
          payload: { text, category, key: key ?? "", memoryId },
        }],
      }),
    });
  }

  async searchVector(tenantId: string, query: string, limit: number = 5): Promise<Array<{ memoryId: string; text: string; score: number }>> {
    const vector = await this.embed(query);
    const QDRANT_URL = process.env.QDRANT_URL ?? "http://localhost:6333";
    const collection = "tenant_" + tenantId + "_user_memory";

    const res = await fetch(QDRANT_URL + "/collections/" + collection + "/points/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vector, limit, with_payload: true }),
    });

    if (!res.ok) return [];
    const json = await res.json() as { result: Array<{ score: number; payload: Record<string, string> }> };
    return (json.result ?? []).map(r => ({
      memoryId: r.payload.memoryId ?? "",
      text: r.payload.text ?? "",
      score: r.score,
    }));
  }

  async deleteVector(tenantId: string, memoryId: string): Promise<void> {
    const QDRANT_URL = process.env.QDRANT_URL ?? "http://localhost:6333";
    const collection = "tenant_" + tenantId + "_user_memory";
    await fetch(QDRANT_URL + "/collections/" + collection + "/points/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points: [memoryId] }),
    }).catch(() => undefined);
  }
}
