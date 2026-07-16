import {
  aiProvidersEnvSchema,
  baseEnvSchema,
  eventBusEnvSchema,
  jwtEnvSchema,
  observabilityEnvSchema,
  postgresEnvSchema,
  redisEnvSchema,
} from '@zarax/shared-config';
import type { z } from 'zod';

export const apiEnvSchema = baseEnvSchema
  .merge(postgresEnvSchema)
  .merge(redisEnvSchema)
  .merge(jwtEnvSchema)
  .merge(eventBusEnvSchema)
  .merge(observabilityEnvSchema)
  .merge(aiProvidersEnvSchema);

export type ApiEnv = z.infer<typeof apiEnvSchema>;
