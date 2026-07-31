import { Controller, Get, Post, Delete, Body, Param, Query, Inject } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentPrincipal, RequirePermission } from "@zarax/shared-auth";
import { PRISMA_CLIENT, type PrismaClient } from "@zarax/database";
import { PERMISSIONS, type Principal } from "@zarax/shared-types";

@ApiTags("memory")
@Controller("memory")
export class MemoryController {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  @RequirePermission(PERMISSIONS.CALLS_READ)
  @ApiOperation({ summary: "Store a memory item." })
  @Post()
  async store(
    @CurrentPrincipal() principal: Principal,
    @Body() body: { category: string; key?: string; value: unknown; source?: string; callId?: string; importance?: number },
  ) {
    const memory = await this.prisma.userMemory.create({
      data: {
        userId: principal.userId,
        tenantId: principal.tenantId,
        category: body.category,
        key: body.key ?? null,
        value: body.value as never,
        source: body.source ?? "voice",
        callId: body.callId ?? null,
        importance: body.importance ?? 1,
      },
    });
    return memory;
  }

  @RequirePermission(PERMISSIONS.CALLS_READ)
  @ApiOperation({ summary: "List memories with optional category filter." })
  @Get()
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query("category") category?: string,
    @Query("limit") limit?: string,
  ): Promise<{ items: Record<string, unknown>[]; total: number }> {
    const where: Record<string, unknown> = {
      userId: principal.userId,
      tenantId: principal.tenantId,
    };
    if (category) where.category = category;

    const l = Math.min(Number(limit ?? 50), 100);
    const [items, total] = await Promise.all([
      this.prisma.userMemory.findMany({ where, orderBy: { createdAt: "desc" }, take: l }),
      this.prisma.userMemory.count({ where }),
    ]);
    return { items: items as unknown as Record<string, unknown>[], total };
  }

  @RequirePermission(PERMISSIONS.CALLS_READ)
  @ApiOperation({ summary: "Search memories by key or value." })
  @Get("search")
  async search(
    @CurrentPrincipal() principal: Principal,
    @Query("q") q: string,
  ): Promise<{ items: Record<string, unknown>[] }> {
    const items = await this.prisma.userMemory.findMany({
      where: {
        userId: principal.userId,
        tenantId: principal.tenantId,
        OR: [
          { key: { contains: q, mode: "insensitive" } },
          { category: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: { importance: "desc" },
      take: 20,
    });
    return { items: items as unknown as Record<string, unknown>[] };
  }

  @RequirePermission(PERMISSIONS.CALLS_READ)
  @ApiOperation({ summary: "Delete a memory item." })
  @Delete(":id")
  async remove(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ) {
    await this.prisma.userMemory.deleteMany({
      where: { id, userId: principal.userId, tenantId: principal.tenantId },
    });
    return { deleted: true };
  }
}
