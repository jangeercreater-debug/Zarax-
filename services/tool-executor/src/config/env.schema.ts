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
    }),
  );

export type ToolExecutorEnv = z.infer<typeof toolExecutorEnvSchema>;
