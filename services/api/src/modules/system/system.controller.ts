import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

interface ServiceHealth {
  name: string;
  url: string;
  status: "healthy" | "degraded" | "down";
  responseMs: number;
  error?: string;
}

const SERVICES = [
  { name: "API", url: process.env.API_SERVICE_URL ?? "http://localhost:3000", path: "/health" },
  { name: "LLM Orchestrator", url: process.env.LLM_ORCHESTRATOR_URL ?? "http://localhost:3006", path: "/health" },
  { name: "Voice Runtime", url: process.env.VOICE_RUNTIME_URL ?? "http://localhost:3001", path: "/health" },
  { name: "Voice Gateway", url: process.env.VOICE_GATEWAY_URL ?? "http://localhost:3002", path: "/health" },
  { name: "STT Service", url: process.env.STT_SERVICE_URL ?? "http://localhost:3003", path: "/health" },
  { name: "TTS Service", url: process.env.TTS_SERVICE_URL ?? "http://localhost:3004", path: "/health" },
  { name: "RAG Service", url: process.env.RAG_SERVICE_URL ?? "http://localhost:3005", path: "/health" },
  { name: "Workflow Engine", url: process.env.WORKFLOW_ENGINE_URL ?? "http://localhost:3007", path: "/health" },
  { name: "Tool Executor", url: process.env.TOOL_EXECUTOR_URL ?? "http://localhost:3008", path: "/health" },
];

@ApiTags("system")
@Controller("system")
export class SystemController {

  @ApiOperation({ summary: "Health check for all services." })
  @Get("health")
  async health(): Promise<Record<string, unknown>> {
    const checks: ServiceHealth[] = await Promise.all(
      SERVICES.map(async (svc) => {
        const start = Date.now();
        try {
          const res = await fetch(svc.url + svc.path, { signal: AbortSignal.timeout(5000) });
          return {
            name: svc.name,
            url: svc.url,
            status: res.ok ? "healthy" as const : "degraded" as const,
            responseMs: Date.now() - start,
          };
        } catch (error) {
          return {
            name: svc.name,
            url: svc.url,
            status: "down" as const,
            responseMs: Date.now() - start,
            error: error instanceof Error ? error.message : "unreachable",
          };
        }
      })
    );

    const healthy = checks.filter(c => c.status === "healthy").length;
    const degraded = checks.filter(c => c.status === "degraded").length;
    const down = checks.filter(c => c.status === "down").length;

    const overall = down > 0 ? "degraded" : degraded > 0 ? "degraded" : "healthy";

    // Check external dependencies
    const externalChecks = await Promise.all([
      this.checkRedis(),
      this.checkDatabase(),
      this.checkQdrant(),
    ]);

    return {
      overall,
      services: checks,
      external: externalChecks,
      summary: { total: checks.length, healthy, degraded, down },
      timestamp: new Date().toISOString(),
    };
  }

  @ApiOperation({ summary: "Uptime and version info." })
  @Get("info")
  async info(): Promise<Record<string, unknown>> {
    return {
      service: "zarax-api",
      version: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
      nodeVersion: process.version,
      uptime: Math.round(process.uptime()),
      uptimeHuman: this.formatUptime(process.uptime()),
      memory: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + " MB",
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + " MB",
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + " MB",
      },
      environment: process.env.NODE_ENV ?? "development",
      timestamp: new Date().toISOString(),
    };
  }

  private async checkRedis(): Promise<Record<string, unknown>> {
    const start = Date.now();
    try {
      const url = process.env.REDIS_URL;
      return { name: "Redis", status: url ? "configured" : "not_configured", responseMs: Date.now() - start };
    } catch {
      return { name: "Redis", status: "error", responseMs: Date.now() - start };
    }
  }

  private async checkDatabase(): Promise<Record<string, unknown>> {
    const start = Date.now();
    try {
      const url = process.env.DATABASE_URL;
      return { name: "PostgreSQL (Neon)", status: url ? "configured" : "not_configured", responseMs: Date.now() - start };
    } catch {
      return { name: "PostgreSQL (Neon)", status: "error", responseMs: Date.now() - start };
    }
  }

  private async checkQdrant(): Promise<Record<string, unknown>> {
    const start = Date.now();
    try {
      const url = process.env.QDRANT_URL;
      if (!url) return { name: "Qdrant", status: "not_configured", responseMs: 0 };
      const res = await fetch(url + "/healthz", { signal: AbortSignal.timeout(3000) });
      return { name: "Qdrant", status: res.ok ? "healthy" : "degraded", responseMs: Date.now() - start };
    } catch {
      return { name: "Qdrant", status: "down", responseMs: Date.now() - start };
    }
  }

  private formatUptime(seconds: number): string {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const parts: string[] = [];
    if (d > 0) parts.push(d + "d");
    if (h > 0) parts.push(h + "h");
    parts.push(m + "m");
    return parts.join(" ");
  }
}
