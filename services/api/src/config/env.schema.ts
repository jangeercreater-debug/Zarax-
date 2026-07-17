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

export const apiEnvSchema = baseEnvSchema
  .merge(postgresEnvSchema)
  .merge(redisEnvSchema)
  .merge(jwtEnvSchema)
  .merge(eventBusEnvSchema)
  .merge(observabilityEnvSchema)
  .merge(llmProvidersEnvSchema)
  .merge(
    z.object({
      // Used to build password-reset/email-verification links. Points at apps/web.
      DASHBOARD_URL: z.string().url().default('http://localhost:3100'),
    }),
  );

export type ApiEnv = z.infer<typeof apiEnvSchema>;
