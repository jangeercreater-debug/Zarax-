import { Controller, Get, Post, Delete, Body, Param, Inject } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentPrincipal, RequirePermission } from "@zarax/shared-auth";
import { PRISMA_CLIENT, type PrismaClient } from "@zarax/database";
import { PERMISSIONS, type Principal } from "@zarax/shared-types";
import * as crypto from "crypto";

const KEY_PREFIX = "zrx_";

function generateApiKey(): string {
  return KEY_PREFIX + crypto.randomBytes(24).toString("hex");
}

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

@ApiTags("api-keys")
@Controller("api-keys")
export class ApiKeysController {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  @RequirePermission(PERMISSIONS.API_KEYS_MANAGE)
  @ApiOperation({ summary: "Create a new API key." })
  @Post()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: { label: string; scopes?: string[] },
  ): Promise<Record<string, unknown>> {
    const rawKey = generateApiKey();
    const keyHash = hashKey(rawKey);
    const keyPrefix = rawKey.slice(0, 12) + "...";

    const apiKey = await this.prisma.apiKey.create({
      data: {
        tenantId: principal.tenantId,
        label: body.label,
        keyHash,
        keyPrefix,
        scopes: body.scopes ?? ["read", "write"],
      },
    });

    return {
      id: apiKey.id,
      label: apiKey.label,
      key: rawKey,
      keyPrefix,
      scopes: apiKey.scopes,
      createdAt: apiKey.createdAt,
      message: "Save this key now. It will not be shown again.",
    };
  }

  @RequirePermission(PERMISSIONS.API_KEYS_MANAGE)
  @ApiOperation({ summary: "List all API keys." })
  @Get()
  async list(
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ items: Record<string, unknown>[]; total: number }> {
    const items = await this.prisma.apiKey.findMany({
      where: { tenantId: principal.tenantId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        label: true,
        keyPrefix: true,
        scopes: true,
        revokedAt: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });

    return {
      items: items.map((k) => ({
        ...k,
        status: k.revokedAt ? "revoked" : "active",
      })),
      total: items.length,
    };
  }

  @RequirePermission(PERMISSIONS.API_KEYS_MANAGE)
  @ApiOperation({ summary: "Revoke an API key." })
  @Delete(":id")
  async revoke(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<{ revoked: boolean }> {
    await this.prisma.apiKey.updateMany({
      where: { id, tenantId: principal.tenantId },
      data: { revokedAt: new Date() },
    });
    return { revoked: true };
  }

  @RequirePermission(PERMISSIONS.API_KEYS_MANAGE)
  @ApiOperation({ summary: "Rotate an API key — revokes old, creates new with same config." })
  @Post(":id/rotate")
  async rotate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Record<string, unknown>> {
    const existing = await this.prisma.apiKey.findFirst({
      where: { id, tenantId: principal.tenantId, revokedAt: null },
    });
    if (!existing) return { error: "Key not found or already revoked" };

    await this.prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });

    const rawKey = generateApiKey();
    const keyHash = hashKey(rawKey);
    const keyPrefix = rawKey.slice(0, 12) + "...";

    const newKey = await this.prisma.apiKey.create({
      data: {
        tenantId: principal.tenantId,
        label: existing.label + " (rotated)",
        keyHash,
        keyPrefix,
        scopes: existing.scopes,
      },
    });

    return {
      id: newKey.id,
      label: newKey.label,
      key: rawKey,
      keyPrefix,
      scopes: newKey.scopes,
      createdAt: newKey.createdAt,
      rotatedFrom: id,
      message: "Save this key now. It will not be shown again.",
    };
  }

  @RequirePermission(PERMISSIONS.API_KEYS_MANAGE)
  @ApiOperation({ summary: "Get API key usage stats." })
  @Get(":id/usage")
  async usage(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Record<string, unknown>> {
    const key = await this.prisma.apiKey.findFirst({
      where: { id, tenantId: principal.tenantId },
      select: { id: true, label: true, lastUsedAt: true, createdAt: true, scopes: true, revokedAt: true },
    });
    if (!key) return { error: "Key not found" };

    const daysSinceCreation = Math.floor((Date.now() - key.createdAt.getTime()) / (1000 * 60 * 60 * 24));

    return {
      id: key.id,
      label: key.label,
      status: key.revokedAt ? "revoked" : "active",
      scopes: key.scopes,
      lastUsedAt: key.lastUsedAt,
      createdAt: key.createdAt,
      ageDays: daysSinceCreation,
    };
  }
}
