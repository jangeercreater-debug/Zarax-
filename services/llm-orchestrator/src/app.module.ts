import { Module } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { AiSdkModule } from '@zarax/ai-sdk';
import {
  ApiKeyRepository,
  createPrismaClient,
  createPrismaHealthIndicator,
  ServiceAccountRepository,
} from '@zarax/database';
import { EventBusModule } from '@zarax/event-bus';
import { createRedisClient, createRedisHealthIndicator } from '@zarax/redis-client';
import { AuthModule, API_KEY_VALIDATOR, SERVICE_ACCOUNT_VALIDATOR } from '@zarax/shared-auth';
import { AppConfigModule } from '@zarax/shared-config';
import { LoggerModule } from '@zarax/shared-logger';
import { HealthModule, MetricsModule } from '@zarax/shared-observability';

import { DatabaseModule } from './common/database.module';
import { llmOrchestratorEnvSchema } from './config/env.schema';
import { OrchestrationModule } from './orchestration/orchestration.module';

// See services/api/src/app.module.ts for why these instances are built directly from
// process.env here rather than via DI — the same reasoning applies to every service.
const prisma = createPrismaClient();
const redis = createRedisClient({ url: process.env.REDIS_URL ?? '' });
const healthIndicatorService = new HealthIndicatorService();

@Module({
  imports: [
    AppConfigModule.forRoot({ schema: llmOrchestratorEnvSchema }),
    LoggerModule.forRoot({
      serviceName: 'llm-orchestrator',
      level: process.env.LOG_LEVEL ?? 'info',
      pretty: process.env.NODE_ENV !== 'production',
    }),
    EventBusModule.forRoot({
      redisUrl: process.env.EVENT_BUS_REDIS_URL ?? process.env.REDIS_URL ?? '',
    }),
    HealthModule.forRoot({
      indicators: [
        createPrismaHealthIndicator(prisma, healthIndicatorService),
        createRedisHealthIndicator(redis, healthIndicatorService),
      ],
    }),
    MetricsModule.forRoot({ serviceName: 'llm-orchestrator' }),
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
    AiSdkModule.forRoot({
      defaultProvider: (process.env.DEFAULT_LLM_PROVIDER as never) ?? 'anthropic',
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      groqApiKey: process.env.GROQ_API_KEY,
      openaiApiKey: process.env.OPENAI_API_KEY,
      geminiApiKey: process.env.GEMINI_API_KEY,
    }),
    DatabaseModule,
    OrchestrationModule,
  ],
})
export class AppModule {}
