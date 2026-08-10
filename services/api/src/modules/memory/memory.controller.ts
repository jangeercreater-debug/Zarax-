import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentPrincipal, RequirePermission } from "@zarax/shared-auth";
import { PERMISSIONS, type Principal } from "@zarax/shared-types";
import { MemoryService, MEMORY_CATEGORIES } from "./memory.service";

@ApiTags("memory")
@Controller("memory")
export class MemoryController {
  constructor(private readonly memoryService: MemoryService) {}

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
    return this.memoryService.store({ tenantId: principal.tenantId, userId: principal.id, ...body });
  }

  @RequirePermission(PERMISSIONS.CALLS_READ)
  @ApiOperation({ summary: "Update a memory item." })
  @Patch(":id")
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: { category?: string; key?: string; value?: unknown; importance?: number; expiresInDays?: number },
  ): Promise<{ updated: boolean }> {
    return this.memoryService.update(principal.tenantId, principal.id, id, body);
  }

  @RequirePermission(PERMISSIONS.CALLS_READ)
  @ApiOperation({ summary: "List memories with optional category filter. Excludes expired memories." })
  @Get()
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query("category") category?: string,
    @Query("limit") limit?: string,
  ): Promise<{ items: Record<string, unknown>[]; total: number }> {
    return this.memoryService.list(principal.tenantId, principal.id, category, Number(limit ?? 50));
  }

  @RequirePermission(PERMISSIONS.CALLS_READ)
  @ApiOperation({ summary: "Ranked semantic search over memories (excludes expired)." })
  @Get("search")
  async search(
    @CurrentPrincipal() principal: Principal,
    @Query("q") q: string,
    @Query("limit") limit?: string,
  ): Promise<{ items: Record<string, unknown>[] }> {
    return { items: await this.memoryService.rankedSearch(principal.tenantId, principal.id, q, Number(limit ?? 10)) };
  }

  @RequirePermission(PERMISSIONS.CALLS_READ)
  @ApiOperation({ summary: "Delete a memory item." })
  @Delete(":id")
  async remove(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<{ deleted: boolean }> {
    return this.memoryService.remove(principal.tenantId, principal.id, id);
  }
}
