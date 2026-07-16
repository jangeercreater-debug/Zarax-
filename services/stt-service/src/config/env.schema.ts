import {
  baseEnvSchema,
  deepgramEnvSchema,
  observabilityEnvSchema,
} from '@zarax/shared-config';
import { z } from 'zod';

export const sttServiceEnvSchema = baseEnvSchema
  .merge(deepgramEnvSchema)
  .merge(observabilityEnvSchema)
  .merge(
    z.object({
      /** Shared secret internal callers (voice-gateway's future audio worker,
       * llm-orchestrator) present as a `token` query param on the WS upgrade request.
       * Not a JWT — this endpoint is never reachable from a browser directly, only
       * from other internal services on the private network. */
      INTERNAL_SERVICE_TOKEN: z.string().min(32),
    }),
  );

export type SttServiceEnv = z.infer<typeof sttServiceEnvSchema>;
