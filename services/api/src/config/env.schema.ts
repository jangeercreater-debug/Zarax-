import {
  baseEnvSchema,
  eventBusEnvSchema,
  jwtEnvSchema,
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
  .merge(
    z.object({
      // Used to build password-reset/email-verification links. Points at apps/web.
      DASHBOARD_URL: z.string().url().default('http://localhost:3100'),

      // "Test Agent" reuses llm-orchestrator's real conversation pipeline via HTTP
      // (see modules/agents/clients/llm-orchestrator.client.ts) rather than
      // reimplementing any of its tool-calling/RAG/metering logic here.
      LLM_ORCHESTRATOR_URL: z.string().url().default('http://localhost:3006'),
      // A ServiceAccount-issued token services/api authenticates to llm-orchestrator
      // with — same mechanism llm-orchestrator itself uses to call rag-service.
      LLM_ORCHESTRATOR_SERVICE_ACCOUNT_TOKEN: z.string().min(1),

      // Populates the Voice Agent Builder's tool multi-select from tool-executor's
      // real catalog instead of a hardcoded list.
      TOOL_EXECUTOR_URL: z.string().url().default('http://localhost:3004'),
      // Must match tool-executor's own INTERNAL_SERVICE_TOKEN value — the same shared
      // secret InternalTokenGuard checks for stt-service/tts-service/tool-executor.
      TOOL_EXECUTOR_INTERNAL_SERVICE_TOKEN: z.string().min(32),
      STT_SERVICE_URL: z.string().url().default('http://localhost:3002'),
      TTS_SERVICE_URL: z.string().url().default('http://localhost:3003'),
      VOICE_GATEWAY_URL: z.string().url().default('http://localhost:3005'),
      VOICE_RUNTIME_URL: z.string().url().default('http://localhost:3008'),
      // voice-runtime uses this to fetch agent config internally (not via JWT/API key).
      // Must match VOICE_RUNTIME_INTERNAL_SERVICE_TOKEN in services/voice-runtime's env.
      INTERNAL_SERVICE_TOKEN: z.string().min(32),
    }),
  );

export type ApiEnv = z.infer<typeof apiEnvSchema>;
