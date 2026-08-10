import { Inject, Injectable, Logger } from "@nestjs/common";
import { PRISMA_CLIENT, type PrismaClient } from "@zarax/database";
import { MemoryVectorService } from "./memory-vector.service";

/** Canonical categories for Phase 5 (Persistent Memory Engine). Free text is still
 * accepted for backward compatibility, but the remember tool / voice pipeline should
 * use one of these so recall and ranking behave predictably. */
export const MEMORY_CATEGORIES = [
  "name", "family", "friend", "phone", "address", "birthday",
  "preference", "goal", "project", "task", "habit", "favorite", "note", "fact",
] as const;

export interface StoreMemoryInput {
  tenantId: string;
  userId: string;
  category: string;
  key?: string | null;
  value: unknown;
  source?: string;
  callId?: string | null;
  importance?: number;
  expiresInDays?: number;
}

function notExpiredFilter(): Record<string, unknown> {
  return { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] };
}

function expiresAtFromDays(days: number | undefined): Date | undefined {
  if (!days || days <= 0) return undefined;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/** Combines semantic similarity with importance and recency so the memories injected
 * into a live conversation are the ones that actually matter, not just the closest
 * vector match — a memory tagged importance=5 from yesterday should usually outrank
 * importance=1 from months ago even with a slightly lower embedding score. */
function rankScore(vectorScore: number, importance: number, updatedAt: Date): number {
  const daysSince = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);
  const recencyScore = 1 / (1 + daysSince / 30);
  const importanceScore = Math.min(importance, 5) / 5;
  return vectorScore * 0.55 + importanceScore * 0.3 + recencyScore * 0.15;
}

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly vectorService: MemoryVectorService,
  ) {}

  async store(input: StoreMemoryInput): Promise<Record<string, unknown>> {
    const memory = await this.prisma.userMemory.create({
      data: {
        userId: input.userId,
        tenantId: input.tenantId,
        category: input.category,
        key: input.key ?? null,
        value: input.value as never,
        source: input.source ?? "voice",
        callId: input.callId ?? null,
        importance: input.importance ?? 1,
        expiresAt: expiresAtFromDays(input.expiresInDays) ?? null,
      },
    });

    const text = input.key
      ? input.category + ": " + input.key + " = " + JSON.stringify(input.value)
      : input.category + ": " + JSON.stringify(input.value);
    await this.vectorService.storeVector(input.tenantId, memory.id, text, input.category, input.key ?? null)
      .catch((error: unknown) => {
        this.logger.warn("storeVector failed (memory saved to Postgres, semantic search may miss it): " +
          (error instanceof Error ? error.message : String(error)));
      });

    return memory as unknown as Record<string, unknown>;
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    body: { category?: string; key?: string; value?: unknown; importance?: number; expiresInDays?: number },
  ): Promise<{ updated: boolean }> {
    const data: Record<string, unknown> = {};
    if (body.category !== undefined) data.category = body.category;
    if (body.key !== undefined) data.key = body.key;
    if (body.value !== undefined) data.value = body.value as never;
    if (body.importance !== undefined) data.importance = body.importance;
    if (body.expiresInDays !== undefined) data.expiresAt = expiresAtFromDays(body.expiresInDays) ?? null;

    const result = await this.prisma.userMemory.updateMany({
      where: { id, userId, tenantId },
      data,
    });

    if (body.value !== undefined || body.key !== undefined) {
      const updated = await this.prisma.userMemory.findFirst({ where: { id } });
      if (updated) {
        const text = (updated.key ? updated.category + ": " + updated.key + " = " : updated.category + ": ") + JSON.stringify(updated.value);
        await this.vectorService.storeVector(tenantId, id, text, updated.category, updated.key).catch(() => undefined);
      }
    }

    return { updated: result.count > 0 };
  }

  async list(tenantId: string, userId: string, category?: string, limit = 50): Promise<{ items: Record<string, unknown>[]; total: number }> {
    const where: Record<string, unknown> = { userId, tenantId, ...notExpiredFilter() };
    if (category) where.category = category;

    const l = Math.min(limit, 100);
    const [items, total] = await Promise.all([
      this.prisma.userMemory.findMany({ where, orderBy: [{ importance: "desc" }, { createdAt: "desc" }], take: l }),
      this.prisma.userMemory.count({ where }),
    ]);
    return { items: items as unknown as Record<string, unknown>[], total };
  }

  /** Combines vector similarity with importance/recency ranking — used by both the
   * public /memory/search endpoint and the internal endpoint the voice pipeline calls
   * mid-conversation to recall relevant memories before the LLM responds. */
  async rankedSearch(tenantId: string, userId: string, q: string, limit = 10): Promise<Record<string, unknown>[]> {
    const vectorResults = await this.vectorService.searchVector(tenantId, q, Math.max(limit * 2, 10)).catch(() => []);

    if (vectorResults.length > 0) {
      const memoryIds = vectorResults.map(r => r.memoryId).filter(Boolean);
      const rows = await this.prisma.userMemory.findMany({
        where: { id: { in: memoryIds }, userId, tenantId, ...notExpiredFilter() },
      });
      const scoreById = new Map(vectorResults.map(r => [r.memoryId, r.score]));
      const ranked = rows
        .map(row => ({ row, rank: rankScore(scoreById.get(row.id) ?? 0, row.importance, row.updatedAt) }))
        .sort((a, b) => b.rank - a.rank)
        .slice(0, limit)
        .map(({ row }) => row as unknown as Record<string, unknown>);
      if (ranked.length > 0) return ranked;
    }

    const rows = await this.prisma.userMemory.findMany({
      where: {
        userId, tenantId, ...notExpiredFilter(),
        OR: [
          { key: { contains: q, mode: "insensitive" } },
          { category: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
      take: limit,
    });
    return rows as unknown as Record<string, unknown>[];
  }

  async remove(tenantId: string, userId: string, id: string): Promise<{ deleted: boolean }> {
    await this.prisma.userMemory.deleteMany({ where: { id, userId, tenantId } });
    await this.vectorService.deleteVector(tenantId, id).catch(() => undefined);
    return { deleted: true };
  }
}
