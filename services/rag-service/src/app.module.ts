import { Module } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import {
  ApiKeyRepository,
  createPrismaClient,
  createPrismaHealthIndicator,
  ServiceAccountRepository,
} from '@zarax/database';
import { createQdrantClient, createQdrantHealthIndicator } from '@zarax/qdrant-client';
import { createRedisClient, createRedisHealthIndicator } from '@zarax/redis-client';
import { AuthModule, API_KEY_VALIDATOR, SERVICE_ACCOUNT_VALIDATOR } from '@zarax/shared-auth';
import { AppConfigModule } from '@zarax/shared-config';
import { LoggerModule } from '@zarax/shared-logger';
import { HealthModule, MetricsModule } from '@zarax/shared-observability';

import { DatabaseModule } from './common/database.module';
import { ragServiceEnvSchema } from './config/env.schema';
import { KnowledgeBaseModule } from './knowledge-base/knowledge-base.module';

// See services/api/src/app.module.ts for why these instances are built directly from
// process.env here rather than via DI — the same reasoning applies to every service.
const prisma = createPrismaClient();
const redis = createRedisClient({ url: process.env.REDIS_URL ?? '' });
const qdrant = createQdrantClient({
  url: process.env.QDRANT_URL ?? '',
  apiKey: process.env.QDRANT_API_KEY,
});
const healthIndicatorService = new HealthIndicatorService();

@Module({
  imports: [
    AppConfigModule.forRoot({ schema: ragServiceEnvSchema }),
    LoggerModule.forRoot({
      serviceName: 'rag-service',
      level: process.env.LOG_LEVEL ?? 'info',
      pretty: process.env.NODE_ENV !== 'production',
    }),
    HealthModule.forRoot({
      indicators: [
        createPrismaHealthIndicator(prisma, healthIndicatorService),
        createRedisHealthIndicator(redis, healthIndicatorService),
        createQdrantHealthIndicator(qdrant, healthIndicatorService),
      ],
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
    DatabaseModule,
    KnowledgeBaseModule,
  ],
})
export class AppModule {}
