import { Module } from '@nestjs/common';
import { AiSdkModule } from '@zarax/ai-sdk';
import {
  ApiKeyRepository,
  createPrismaClient,
  PrismaClientModule,
  ServiceAccountRepository,
} from '@zarax/database';
import { EventBusModule } from '@zarax/event-bus';
import { AuthModule, API_KEY_VALIDATOR, SERVICE_ACCOUNT_VALIDATOR } from '@zarax/shared-auth';
import { AppConfigModule } from '@zarax/shared-config';
import { LoggerModule } from '@zarax/shared-logger';
import { HealthModule, MetricsModule } from '@zarax/shared-observability';

import { llmOrchestratorEnvSchema } from './config/env.schema';
import { OrchestrationModule } from './orchestration/orchestration.module';
import { SummaryModule } from './summary/summary.module';

const prisma = createPrismaClient({ poolMax: Number(process.env.DATABASE_POOL_MAX ?? 10) });

@Module({
  imports: [
    AppConfigModule.forRoot({ schema: llmOrchestratorEnvSchema as never }),
    LoggerModule.forRoot({
      serviceName: 'llm-orchestrator',
      level: process.env.LOG_LEVEL ?? 'info',
      pretty: process.env.NODE_ENV !== 'production',
    }),
    EventBusModule.forRoot({
      redisUrl: process.env.EVENT_BUS_REDIS_URL ?? process.env.REDIS_URL ?? '',
    }),
    HealthModule.forRoot({
      indicators: [],
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
      // Zarax's own self-hosted brain — registered only when both are set, so this
      // is a no-op (falls back to whatever DEFAULT_LLM_PROVIDER already resolves to)
      // until services/zarax-brain-inference is actually deployed and its URL/token
      // are configured. Never auto-selected as default here — that switch is a
      // deliberate, separately-tested cutover per the migration's rollout plan.
      selfHostedApiKey: process.env.SELF_HOSTED_LLM_API_KEY,
      selfHostedBaseUrl: process.env.SELF_HOSTED_LLM_BASE_URL,
    }),
    PrismaClientModule.forRoot(),
    OrchestrationModule,
    SummaryModule,
  ],
})
export class AppModule {}
