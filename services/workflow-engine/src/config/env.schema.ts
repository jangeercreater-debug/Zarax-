import {
  baseEnvSchema,
  jwtEnvSchema,
  llmProvidersEnvSchema,
  observabilityEnvSchema,
  postgresEnvSchema,
  redisEnvSchema,
} from '@zarax/shared-config';
import { z } from 'zod';

export const workflowEngineEnvSchema = baseEnvSchema
  .merge(postgresEnvSchema)
  .merge(redisEnvSchema)
  .merge(jwtEnvSchema)
  .merge(observabilityEnvSchema)
  .merge(llmProvidersEnvSchema)
  .merge(
    z.object({
      // AI Agent node — same real pipeline "Test Agent" (services/api) reuses.
      LLM_ORCHESTRATOR_URL: z.string().url().default('http://localhost:3006'),
      LLM_ORCHESTRATOR_SERVICE_ACCOUNT_TOKEN: z.string().min(1),

      // Knowledge Base node.
      RAG_SERVICE_URL: z.string().url().default('http://localhost:3005'),
      RAG_SERVICE_ACCOUNT_TOKEN: z.string().min(1),
    }),
  );

export type WorkflowEngineEnv = z.infer<typeof workflowEngineEnvSchema>;
