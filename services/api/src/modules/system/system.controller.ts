import { Controller, Get, Inject } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentPrincipal, RequirePermission } from "@zarax/shared-auth";
import { PERMISSIONS, type Principal } from "@zarax/shared-types";
import { PRISMA_CLIENT, type PrismaClient } from "@zarax/database";

interface ServiceStatus {
  name: string;
  url: string;
  status: "healthy" | "degraded" | "down";
  latencyMs: number | null;
  checkedAt: string;
}

@ApiTags("system")
@Controller("system")
export class SystemController {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
  ) {}

  private async pingService(name: string, baseUrl: string, token?: string): Promise<ServiceStatus> {
    const start = Date.now();
    const checkedAt = new Date().toISOString();
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = "Bearer " + token;
      const res = await fetch(baseUrl + "/health", {
        signal: AbortSignal.timeout(5000),
        headers,
      });
      const latencyMs = Date.now() - start;
      return {
        name,
        url: baseUrl,
        status: res.ok ? "healthy" : "degraded",
        latencyMs,
        checkedAt,
      };
    } catch {
      return { name, url: baseUrl, status: "down", latencyMs: null, checkedAt };
    }
  }

  @RequirePermission(PERMISSIONS.TENANT_MANAGE_BILLING)
  @ApiOperation({ summary: "System health status for all Zarax services." })
  @Get("health")
  async systemHealth(@CurrentPrincipal() _principal: Principal) {
    const internalToken = process.env.INTERNAL_SERVICE_TOKEN ?? "";
    const llmToken = process.env.LLM_ORCHESTRATOR_SERVICE_ACCOUNT_TOKEN ?? "";

    const serviceUrls: [string, string, string?][] = [
      ["LLM Orchestrator", process.env.LLM_ORCHESTRATOR_URL ?? "", llmToken],
      ["Tool Executor", process.env.TOOL_EXECUTOR_URL ?? "", internalToken],
      ["STT Service", process.env.STT_SERVICE_URL ?? "", internalToken],
      ["TTS Service", process.env.TTS_SERVICE_URL ?? "", internalToken],
      ["Voice Gateway", process.env.VOICE_GATEWAY_URL ?? "", internalToken],
      ["Voice Runtime", process.env.VOICE_RUNTIME_URL ?? "", internalToken],
    ];

    const [dbCheck, ...serviceChecks] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => ({
        name: "Database",
        url: "neon",
        status: "healthy" as const,
        latencyMs: null,
        checkedAt: new Date().toISOString(),
      })).catch(() => ({
        name: "Database",
        url: "neon",
        status: "down" as const,
        latencyMs: null,
        checkedAt: new Date().toISOString(),
      })),
      ...serviceUrls.map(([name, url, token]) => this.pingService(name, url, token)),
    ]);

    const services = [dbCheck, ...serviceChecks];
    const healthy = services.filter(s => s.status === "healthy").length;
    const total = services.length;

    return {
      overall: healthy === total ? "healthy" : healthy > total / 2 ? "degraded" : "down",
      summary: { healthy, degraded: services.filter(s => s.status === "degraded").length, down: services.filter(s => s.status === "down").length, total },
      services,
      checkedAt: new Date().toISOString(),
    };
  }
}
