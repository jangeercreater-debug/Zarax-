import { baseEnvSchema, cartesiaEnvSchema, observabilityEnvSchema } from '@zarax/shared-config';
import { z } from 'zod';

export const ttsServiceEnvSchema = baseEnvSchema
  .merge(cartesiaEnvSchema)
  .merge(observabilityEnvSchema)
  .merge(
    z.object({
      /** Same shared-secret pattern as stt-service — this service is only ever called
       * by other internal services, never directly by an end client. */
      INTERNAL_SERVICE_TOKEN: z.string().min(32),
    }),
  );

export type TtsServiceEnv = z.infer<typeof ttsServiceEnvSchema>;
