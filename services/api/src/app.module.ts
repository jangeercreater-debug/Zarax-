import { Module } from '@nestjs/common';
import { ApiStandardsModule } from '@zarax/api-standards';
import { AuditLogModule } from '@zarax/audit-log';
import {
  ApiKeyRepository,
  createPrismaClient,
  createPrismaHealthIndicator,
  PrismaClientModule,
  ServiceAccountRepository,
} from '@zarax/database';
import { EventBusModule } from '@zarax/event-bus';
import { FeatureFlagsModule } from '@zarax/feature-flags';
import { createRedisClient, createRedisHealthIndicator } from '@zarax/redis-client';
import { AuthModule, API_KEY_VALIDATOR, SERVICE_ACCOUNT_VALIDATOR } from '@zarax/shared-auth';
import { AppConfigModule } from '@zarax/shared-config';
import { LoggerModule } from '@zarax/shared-logger';
import { HealthModule, MetricsModule } from '@zarax/shared-observability';

import { apiEnvSchema } from './config/env.schema';
import { AgentsModule } from './modules/agents/agents.module';
import { UsersAuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { InternalModule } from './modules/internal/internal.module';
import { TelephonyModule } from './modules/telephony/telephony.module';

/**
 * NestJS evaluates every dynamic module's .forRoot() call when this file is loaded —
 * before the DI container exists. That means these bootstrap-critical instances can't
 * come from DI yet; they're built directly from process.env here, then re-exposed
 * through PrismaClientModule/EventBusModule for injection into the rest of the app.
 * (Full env validation still happens via AppConfigModule.forRoot() below — this is
 * only for the handful of things that must exist before that runs.)
 */
const prisma = createPrismaClient({ poolMax: Number(process.env.DATABASE_POOL_MAX ?? 10) });
const redis = createRedisClient({ url: process.env.REDIS_URL ?? '' });
const healthIndicatorService = {
  check: (key: string) => ({
    up: (details?: Record<string, unknown>) => ({ [key]: { status: 'up', ...details } } as Record<string, { status: string }>),
    down: (details?: Record<string, unknown>) => ({ [key]: { status: 'down', ...details } } as Record<string, { status: string }>),
  }),
} as never;

@Module({
  imports: [
    AppConfigModule.forRoot({ schema: apiEnvSchema as never }),
    LoggerModule.forRoot({
      serviceName: 'api',
      level: process.env.LOG_LEVEL ?? 'info',
      pretty: process.env.NODE_ENV !== 'production',
    }),
    EventBusModule.forRoot({
      redisUrl: process.env.EVENT_BUS_REDIS_URL ?? process.env.REDIS_URL ?? '',
    }),
    HealthModule.forRoot({
      indicators: [
        createPrismaHealthIndicator(prisma, healthIndicatorService) as never,
        createRedisHealthIndicator(redis, healthIndicatorService) as never,
      ],
    }),
    MetricsModule.forRoot({ serviceName: 'api' }),
    AuthModule.forRoot({
      apiKeyValidatorProvider: {
        provide: API_KEY_VALIDATOR,
        useValue: new ApiKeyRepository(prisma),
      },
      serviceAccountValidatorProvider: {
        provide: SERVICE_ACCOUNT_VALIDATOR,
        useValue: new ServiceAccountRepository(prisma),
      },
    }),
    // --- Production infrastructure standards (see docs/production-standards.md) ---
    AuditLogModule.forRoot(),
    FeatureFlagsModule.forRoot(),
    ApiStandardsModule.forRoot({
      redisUrl: process.env.REDIS_URL ?? '',
      defaultRateLimit: { limit: 100, windowMs: 60_000 },
    }),
    // --------------------------------------------------------------------------------
    PrismaClientModule.forRoot(),
    UsersAuthModule,
    TenantsModule,
    AgentsModule,
    UsersModule,
    WorkflowsModule,
    InternalModule,
    TelephonyModule,
  ],
})
export class AppModule {}
