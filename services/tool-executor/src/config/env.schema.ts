import {
  baseEnvSchema,
  eventBusEnvSchema,
  observabilityEnvSchema,
  postgresEnvSchema,
  redisEnvSchema,
} from '@zarax/shared-config';
import { z } from 'zod';

export const toolExecutorEnvSchema = baseEnvSchema
  .merge(postgresEnvSchema)
  .merge(redisEnvSchema)
  .merge(eventBusEnvSchema)
  .merge(observabilityEnvSchema)
  .merge(
    z.object({
      INTERNAL_SERVICE_TOKEN: z.string().min(32),
      // Used by the remember_memory tool to persist memories via services/api's
      // internal/memory endpoint (Phase 5 — Persistent Memory Engine).
      API_SERVICE_URL: z.string().url(),
    }),
  );

export type ToolExecutorEnv = z.infer<typeof toolExecutorEnvSchema>;
