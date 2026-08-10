import { Injectable, Logger } from "@nestjs/common";

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL ?? "http://localhost:3004";
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? "";
const QDRANT_URL = process.env.QDRANT_URL ?? "http://localhost:6333";
const QDRANT_API_KEY = process.env.QDRANT_API_KEY ?? "";

function qdrantHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (QDRANT_API_KEY) headers["api-key"] = QDRANT_API_KEY;
  return headers;
}

/**
 * Semantic memory storage/search backed by Qdrant, with embeddings produced by
 * rag-service's internal embeddings endpoint (services/rag-service's
 * InternalEmbeddingsController — protected by the shared INTERNAL_SERVICE_TOKEN,
 * same as services/api's own internal/agents endpoint).
 */
@Injectable()
export class MemoryVectorService {
  private readonly logger = new Logger(MemoryVectorService.name);

  async embed(text: string): Promise<number[]> {
    const res = await fetch(RAG_SERVICE_URL + "/internal/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": INTERNAL_TOKEN,
      },
      body: JSON.stringify({ texts: [text] }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error("Embedding failed: " + res.status + " " + (await res.text().catch(() => "")));
    const json = await res.json() as { embeddings: number[][] };
    return json.embeddings[0] ?? [];
  }

  async storeVector(tenantId: string, memoryId: string, text: string, category: string, key: string | null): Promise<void> {
    const vector = await this.embed(text);
    const collection = "tenant_" + tenantId + "_user_memory";

    // Ensure collection exists (idempotent — 409 if it already does, which is fine)
    await fetch(QDRANT_URL + "/collections/" + collection, {
      method: "PUT",
      headers: qdrantHeaders(),
      body: JSON.stringify({ vectors: { size: vector.length || 1536, distance: "Cosine" } }),
    }).catch((error: unknown) => {
      this.logger.warn("Qdrant collection ensure failed: " + (error instanceof Error ? error.message : String(error)));
    });

    const res = await fetch(QDRANT_URL + "/collections/" + collection + "/points", {
      method: "PUT",
      headers: qdrantHeaders(),
      body: JSON.stringify({
        points: [{
          id: memoryId,
          vector,
          payload: { text, category, key: key ?? "", memoryId },
        }],
      }),
    });

    if (!res.ok) {
      throw new Error("Qdrant upsert failed: " + res.status + " " + (await res.text().catch(() => "")));
    }
  }

  async searchVector(tenantId: string, query: string, limit: number = 5): Promise<Array<{ memoryId: string; text: string; score: number }>> {
    const vector = await this.embed(query);
    const collection = "tenant_" + tenantId + "_user_memory";

    const res = await fetch(QDRANT_URL + "/collections/" + collection + "/points/search", {
      method: "POST",
      headers: qdrantHeaders(),
      body: JSON.stringify({ vector, limit, with_payload: true }),
    });

    if (!res.ok) {
      if (res.status !== 404) {
        this.logger.warn("Qdrant search failed: " + res.status + " " + (await res.text().catch(() => "")));
      }
      return [];
    }
    const json = await res.json() as { result: Array<{ score: number; payload: Record<string, string> }> };
    return (json.result ?? []).map(r => ({
      memoryId: r.payload.memoryId ?? "",
      text: r.payload.text ?? "",
      score: r.score,
    }));
  }

  async deleteVector(tenantId: string, memoryId: string): Promise<void> {
    const collection = "tenant_" + tenantId + "_user_memory";
    await fetch(QDRANT_URL + "/collections/" + collection + "/points/delete", {
      method: "POST",
      headers: qdrantHeaders(),
      body: JSON.stringify({ points: [memoryId] }),
    }).catch((error: unknown) => {
      this.logger.warn("Qdrant delete failed: " + (error instanceof Error ? error.message : String(error)));
    });
  }
}
