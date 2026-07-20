import { Module } from '@nestjs/common';
import { ApiStandardsModule } from '@zarax/api-standards';
import { AuditLogModule } from '@zarax/audit-log';
import {
  ApiKeyRepository,
  createPrismaClient,
  PrismaClientModule,
  ServiceAccountRepository,
} from '@zarax/database';
import { AuthModule, API_KEY_VALIDATOR, SERVICE_ACCOUNT_VALIDATOR } from '@zarax/shared-auth';
import { AppConfigModule } from '@zarax/shared-config';
import { LoggerModule } from '@zarax/shared-logger';
import { HealthModule, MetricsModule } from '@zarax/shared-observability';

import { ragServiceEnvSchema } from './config/env.schema';
import { KnowledgeBaseModule } from './knowledge-base/knowledge-base.module';

// See services/api/src/app.module.ts for why these instances are built directly from
// process.env here rather than via DI — the same reasoning applies to every service.
const prisma = createPrismaClient({ poolMax: Number(process.env.DATABASE_POOL_MAX ?? 10) });

@Module({
  imports: [
    AppConfigModule.forRoot({ schema: ragServiceEnvSchema as never }),
    LoggerModule.forRoot({
      serviceName: 'rag-service',
      level: process.env.LOG_LEVEL ?? 'info',
      pretty: process.env.NODE_ENV !== 'production',
    }),
    HealthModule.forRoot({
      indicators: [],
    }),
    MetricsModule.forRoot({ serviceName: 'rag-service' }),
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
    AuditLogModule.forRoot(),
    ApiStandardsModule.forRoot({
      redisUrl: process.env.REDIS_URL ?? '',
      defaultRateLimit: { limit: 100, windowMs: 60_000 },
    }),
    PrismaClientModule.forRoot(),
    KnowledgeBaseModule,
  ],
})
export class AppModule {}
