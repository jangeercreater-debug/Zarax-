import {
  baseEnvSchema,
  eventBusEnvSchema,
  jwtEnvSchema,
  livekitEnvSchema,
  observabilityEnvSchema,
  postgresEnvSchema,
  redisEnvSchema,
} from '@zarax/shared-config';
import type { z } from 'zod';

export const voiceGatewayEnvSchema = baseEnvSchema
  .merge(postgresEnvSchema)
  .merge(redisEnvSchema)
  .merge(jwtEnvSchema)
  .merge(eventBusEnvSchema)
  .merge(observabilityEnvSchema)
  .merge(livekitEnvSchema);

export type VoiceGatewayEnv = z.infer<typeof voiceGatewayEnvSchema>;
