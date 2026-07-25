import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentPrincipal, RequirePermission } from "@zarax/shared-auth";
import { ApiKeyRepository, PRISMA_CLIENT, type PrismaClient } from "@zarax/database";
import { PERMISSIONS, type Principal } from "@zarax/shared-types";
import { randomBytes } from "node:crypto";

@ApiTags("api-keys")
@Controller("api-keys")
export class ApiKeysController {
  private readonly repo: ApiKeyRepository;
  constructor(@Inject(PRISMA_CLIENT) prisma: PrismaClient) {
    this.repo = new ApiKeyRepository(prisma);
  }

  @RequirePermission(PERMISSIONS.TENANT_MANAGE_BILLING)
  @ApiOperation({ summary: "List all API keys for the tenant." })
  @Get()
  async list(@CurrentPrincipal() principal: Principal) {
    const prisma = Reflect.get(this.repo, "prisma") as PrismaClient;
    return prisma.apiKey.findMany({
      where: { tenantId: principal.tenantId, revokedAt: null },
      select: { id: true, label: true, keyPrefix: true, scopes: true, lastUsedAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
  }

  @RequirePermission(PERMISSIONS.TENANT_MANAGE_BILLING)
  @ApiOperation({ summary: "Create a new API key." })
  @Post()
  async create(@CurrentPrincipal() principal: Principal, @Body() dto: { label: string; scopes?: string[] }) {
    const rawKey = "zrx_" + randomBytes(32).toString("hex");
    const keyPrefix = rawKey.slice(0, 12);
    await this.repo.create({
      tenantId: principal.tenantId,
      label: dto.label,
      rawKey,
      keyPrefix,
      scopes: dto.scopes ?? ["*"],
    });
    return { key: rawKey, keyPrefix, label: dto.label, warning: "Store this key securely. It will not be shown again." };
  }

  @RequirePermission(PERMISSIONS.TENANT_MANAGE_BILLING)
  @ApiOperation({ summary: "Revoke an API key." })
  @HttpCode(HttpStatus.OK)
  @Delete(":id")
  async revoke(@CurrentPrincipal() principal: Principal, @Param("id") id: string) {
    const prisma = Reflect.get(this.repo, "prisma") as PrismaClient;
    const key = await prisma.apiKey.findFirst({ where: { id, tenantId: principal.tenantId } });
    if (!key) return { success: false, error: "Not found" };
    await this.repo.revoke(id);
    return { success: true };
  }
}
