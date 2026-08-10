import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { InternalTokenGuard, Public } from "@zarax/shared-auth";
import { MemoryService } from "./memory.service";

/** Called by services/llm-orchestrator (memory recall mid-conversation) and
 * services/tool-executor (the remember_memory tool) — no JWT/tenant-user session
 * exists in either case, so this is protected by the shared INTERNAL_SERVICE_TOKEN
 * rather than CompositeAuthGuard, matching services/api's own internal/agents
 * endpoint and services/rag-service's internal/embeddings endpoint. */
@ApiTags("internal-memory")
@Public()
@UseGuards(InternalTokenGuard)
@Controller("internal/memory")
export class InternalMemoryController {
  constructor(private readonly memoryService: MemoryService) {}

  @ApiOperation({ summary: "[Internal] Ranked semantic recall for the voice pipeline." })
  @Get("search")
  async search(
    @Query("tenantId") tenantId: string,
    @Query("userId") userId: string,
    @Query("q") q: string,
    @Query("limit") limit?: string,
  ): Promise<{ items: Record<string, unknown>[] }> {
    return { items: await this.memoryService.rankedSearch(tenantId, userId ?? "", q, Number(limit ?? 5)) };
  }

  @ApiOperation({ summary: "[Internal] Store a memory — used by the remember_memory tool." })
  @Post()
  async store(
    @Body() body: { tenantId: string; userId?: string; category: string; key?: string; value: unknown; callId?: string; importance?: number; expiresInDays?: number },
  ): Promise<Record<string, unknown>> {
    return this.memoryService.store({
      tenantId: body.tenantId,
      userId: body.userId ?? "",
      category: body.category,
      key: body.key,
      value: body.value,
      source: "voice",
      callId: body.callId,
      importance: body.importance,
      expiresInDays: body.expiresInDays,
    });
  }
}
