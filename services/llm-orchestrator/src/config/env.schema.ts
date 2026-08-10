import {
  baseEnvSchema,
  eventBusEnvSchema,
  jwtEnvSchema,
  llmProvidersEnvSchema,
  observabilityEnvSchema,
  postgresEnvSchema,
  redisEnvSchema,
} from '@zarax/shared-config';
import { z } from 'zod';

export const llmOrchestratorEnvSchema = baseEnvSchema
  .merge(postgresEnvSchema)
  .merge(redisEnvSchema)
  .merge(eventBusEnvSchema)
  .merge(jwtEnvSchema)
  .merge(observabilityEnvSchema)
  .merge(llmProvidersEnvSchema)
  .merge(
    z.object({
      DEFAULT_LLM_PROVIDER: z.enum(['anthropic', 'groq', 'openai', 'gemini']).default('anthropic'),
      TOOL_EXECUTOR_URL: z.string().url(),
      TOOL_EXECUTOR_INTERNAL_SERVICE_TOKEN: z.string().min(32),
      // RAG is optional — an empty string disables it (see RagClient.search).
      RAG_SERVICE_URL: z.string().optional().default(''),
      RAG_SERVICE_ACCOUNT_TOKEN: z.string().optional().default(''),
      // Used by MemoryClient to recall/store persistent memories mid-conversation via
      // services/api's internal/memory endpoint (Phase 5 — Persistent Memory Engine).
      API_SERVICE_URL: z.string().url(),
      INTERNAL_SERVICE_TOKEN: z.string().min(32),
    }),
  );

export type LlmOrchestratorEnv = z.infer<typeof llmOrchestratorEnvSchema>;
