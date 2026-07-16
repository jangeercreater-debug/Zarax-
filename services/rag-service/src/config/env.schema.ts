import {
  baseEnvSchema,
  jwtEnvSchema,
  observabilityEnvSchema,
  postgresEnvSchema,
  qdrantEnvSchema,
  redisEnvSchema,
} from '@zarax/shared-config';
import { z } from 'zod';

export const ragServiceEnvSchema = baseEnvSchema
  .merge(postgresEnvSchema)
  .merge(redisEnvSchema)
  .merge(qdrantEnvSchema)
  .merge(jwtEnvSchema)
  .merge(observabilityEnvSchema)
  .merge(
    z.object({
      // Required here (not optional, unlike shared-config's aiProvidersEnvSchema) —
      // this service cannot function at all without an embedding provider.
      OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required for embeddings.'),
    }),
  );

export type RagServiceEnv = z.infer<typeof ragServiceEnvSchema>;
