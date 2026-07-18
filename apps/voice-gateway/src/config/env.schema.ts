import {
  baseEnvSchema,
  eventBusEnvSchema,
  jwtEnvSchema,
  livekitEnvSchema,
  observabilityEnvSchema,
  postgresEnvSchema,
  redisEnvSchema,
} from '@zarax/shared-config';
import { z } from 'zod';

export const voiceGatewayEnvSchema = baseEnvSchema
  .merge(postgresEnvSchema)
  .merge(redisEnvSchema)
  .merge(jwtEnvSchema)
  .merge(eventBusEnvSchema)
  .merge(observabilityEnvSchema)
  .merge(livekitEnvSchema)
  .merge(
    z.object({
      // LiveKit SIP trunk ID — required for outbound calls via SipClient.createSIPParticipant().
      // Create one in the LiveKit dashboard under "SIP" → "Trunks".
      LIVEKIT_SIP_TRUNK_ID: z.string().min(1).optional(),
    }),
  );

export type VoiceGatewayEnv = z.infer<typeof voiceGatewayEnvSchema>;
