import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Inject } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentPrincipal, RequirePermission } from "@zarax/shared-auth";
import { PRISMA_CLIENT, type PrismaClient } from "@zarax/database";
import { PERMISSIONS, type Principal } from "@zarax/shared-types";
import { MemoryVectorService } from "./memory-vector.service";

/** Canonical categories for Phase 5 (Persistent Memory Engine). Free text is still
 * accepted for backward compatibility, but the remember tool / voice pipeline should
 * use one of these so recall and ranking behave predictably. */
export const MEMORY_CATEGORIES = [
  "name", "family", "friend", "phone", "address", "birthday",
  "preference", "goal", "project", "task", "habit", "favorite", "note", "fact",
] as const;

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
  const recencyScore = 1 / (1 + daysSince / 30); // decays over ~30 days
  const importanceScore = Math.min(importance, 5) / 5;
  return vectorScore * 0.55 + importanceScore * 0.3 + recencyScore * 0.15;
}

@ApiTags("memory")
@Controller("memory")
export class MemoryController {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly vectorService: MemoryVectorService,
  ) {}

  @RequirePermission(PERMISSIONS.CALLS_READ)
  @ApiOperation({ summary: "List canonical memory categories." })
  @Get("categories")
  categories(): { categories: readonly string[] } {
    return { categories: MEMORY_CATEGORIES };
  }

  @RequirePermission(PERMISSIONS.CALLS_READ)
  @ApiOperation({ summary: "Store a memory item with semantic embedding." })
  @Post()
  async store(
    @CurrentPrincipal() principal: Principal,
    @Body() body: { category: string; key?: string; value: unknown; source?: string; callId?: string; importance?: number; expiresInDays?: number },
  ): Promise<Record<string, unknown>> {
    const memory = await this.prisma.userMemory.create({
      data: {
        userId: principal.id,
        tenantId: principal.tenantId,
        category: body.category,
        key: body.key ?? null,
        value: body.value as never,
        source: body.source ?? "voice",
        callId: body.callId ?? null,
        importance: body.importance ?? 1,
        expiresAt: expiresAtFromDays(body.expiresInDays) ?? null,
      },
    });

    const text = body.key
      ? body.category + ": " + body.key + " = " + JSON.stringify(body.value)
      : body.category + ": " + JSON.stringify(body.value);
    await this.vectorService.storeVector(principal.tenantId, memory.id, text, body.category, body.key ?? null).catch(() => undefined);

    return memory as unknown as Record<string, unknown>;
  }

  @RequirePermission(PERMISSIONS.CALLS_READ)
  @ApiOperation({ summary: "Update a memory item." })
  @Patch(":id")
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: { category?: string; key?: string; value?: unknown; importance?: number; expiresInDays?: number },
  ): Promise<Record<string, unknown>> {
    const data: Record<string, unknown> = {};
    if (body.category !== undefined) data.category = body.category;
    if (body.key !== undefined) data.key = body.key;
    if (body.value !== undefined) data.value = body.value as never;
    if (body.importance !== undefined) data.importance = body.importance;
    if (body.expiresInDays !== undefined) data.expiresAt = expiresAtFromDays(body.expiresInDays) ?? null;

    const memory = await this.prisma.userMemory.updateMany({
      where: { id, userId: principal.id, tenantId: principal.tenantId },
      data,
    });

    if (body.value !== undefined || body.key !== undefined) {
      const updated = await this.prisma.userMemory.findFirst({ where: { id } });
      if (updated) {
        const text = (updated.key ? updated.category + ": " + updated.key + " = " : updated.category + ": ") + JSON.stringify(updated.value);
        await this.vectorService.storeVector(principal.tenantId, id, text, updated.category, updated.key).catch(() => undefined);
      }
    }

    return { updated: memory.count > 0 };
  }

  @RequirePermission(PERMISSIONS.CALLS_READ)
  @ApiOperation({ summary: "List memories with optional category filter. Excludes expired memories." })
  @Get()
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query("category") category?: string,
    @Query("limit") limit?: string,
  ): Promise<{ items: Record<string, unknown>[]; total: number }> {
    const where: Record<string, unknown> = {
      userId: principal.id,
      tenantId: principal.tenantId,
      ...notExpiredFilter(),
    };
    if (category) where.category = category;

    const l = Math.min(Number(limit ?? 50), 100);
    const [items, total] = await Promise.all([
      this.prisma.userMemory.findMany({ where, orderBy: [{ importance: "desc" }, { createdAt: "desc" }], take: l }),
      this.prisma.userMemory.count({ where }),
    ]);
    return { items: items as unknown as Record<string, unknown>[], total };
  }

  @RequirePermission(PERMISSIONS.CALLS_READ)
  @ApiOperation({ summary: "Ranked semantic search over memories (excludes expired)." })
  @Get("search")
  async search(
    @CurrentPrincipal() principal: Principal,
    @Query("q") q: string,
    @Query("limit") limit?: string,
  ): Promise<{ items: Record<string, unknown>[] }> {
    return { items: await this.rankedSearch(principal.tenantId, principal.id, q, Number(limit ?? 10)) };
  }

  /** Shared by the public /memory/search endpoint and the internal endpoint used by
   * the voice pipeline — combines vector similarity with importance/recency ranking. */
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

    // Fallback: keyword match, ranked by importance + recency only (no semantic score).
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

  @RequirePermission(PERMISSIONS.CALLS_READ)
  @ApiOperation({ summary: "Delete a memory item." })
  @Delete(":id")
  async remove(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<{ deleted: boolean }> {
    await this.prisma.userMemory.deleteMany({
      where: { id, userId: principal.id, tenantId: principal.tenantId },
    });
    await this.vectorService.deleteVector(principal.tenantId, id).catch(() => undefined);
    return { deleted: true };
  }
}
