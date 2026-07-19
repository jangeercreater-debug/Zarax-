import { Module } from '@nestjs/common';
import { AuditLogModule } from '@zarax/audit-log';
import {
  createPrismaClient,
  createPrismaHealthIndicator,
  PrismaClientModule,
} from '@zarax/database';
import { createRedisClient, createRedisHealthIndicator } from '@zarax/redis-client';
import { AppConfigModule } from '@zarax/shared-config';
import { LoggerModule } from '@zarax/shared-logger';
import { HealthModule, MetricsModule } from '@zarax/shared-observability';

import { workflowEngineEnvSchema } from './config/env.schema';
import { ExecutionModule } from './execution/execution.module';

// See services/api's app.module.ts for why these instances are built directly from
// process.env here rather than via DI — the same reasoning applies to every service.
// Unlike stt-service/tts-service/tool-executor, this service has no InternalTokenGuard-
// protected HTTP endpoints of its own — it's driven entirely by the job queue
// (services/api enqueues, this service only ever consumes), so there's no AuthModule
// here at all, just the health/metrics surface every service exposes.
const prisma = createPrismaClient({ poolMax: Number(process.env.DATABASE_POOL_MAX ?? 10) });
const redis = createRedisClient({ url: process.env.REDIS_URL ?? '' });
const healthIndicatorService = { check: (key: string) => ({ up: (d?: Record<string, unknown>) => ({ [key]: { status: 'up', ...d } }), down: (d?: Record<string, unknown>) => ({ [key]: { status: 'down', ...d } }) }) } as never;

@Module({
  imports: [
    AppConfigModule.forRoot({ schema: workflowEngineEnvSchema as never }),
    LoggerModule.forRoot({
      serviceName: 'workflow-engine',
      level: process.env.LOG_LEVEL ?? 'info',
      pretty: process.env.NODE_ENV !== 'production',
    }),
    HealthModule.forRoot({
      indicators: [
        createPrismaHealthIndicator(prisma, healthIndicatorService) as never,
        createRedisHealthIndicator(redis, healthIndicatorService) as never,
      ],
    }),
    MetricsModule.forRoot({ serviceName: 'workflow-engine' }),
    AuditLogModule.forRoot({ enableGlobalInterceptor: false }), // no HTTP endpoints to intercept — WorkflowExecutionConsumer calls auditLogService.recordSystemEvent() directly
    PrismaClientModule.forRoot(),
    ExecutionModule,
  ],
})
export class AppModule {}
