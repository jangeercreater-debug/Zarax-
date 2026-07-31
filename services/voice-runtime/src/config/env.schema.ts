import {
  baseEnvSchema,
  eventBusEnvSchema,
  observabilityEnvSchema,
  postgresEnvSchema,
  redisEnvSchema,
} from '@zarax/shared-config';
import { z } from 'zod';

export const voiceRuntimeEnvSchema = baseEnvSchema
  .merge(postgresEnvSchema)
  .merge(redisEnvSchema)
  .merge(eventBusEnvSchema)
  .merge(observabilityEnvSchema)
  .merge(
    z.object({
      // LiveKit — join rooms as the agent participant
      LIVEKIT_URL: z.string().url(),
      LIVEKIT_API_KEY: z.string().min(1),
      LIVEKIT_API_SECRET: z.string().min(1),

      // STT service WebSocket
      STT_SERVICE_URL: z.string().url().default('ws://localhost:3002'),
      STT_INTERNAL_SERVICE_TOKEN: z.string().min(32),

      // TTS service WebSocket
      TTS_SERVICE_URL: z.string().url().default('ws://localhost:3003'),
      TTS_INTERNAL_SERVICE_TOKEN: z.string().min(32),

      // llm-orchestrator — same service account pattern as services/api
      LLM_ORCHESTRATOR_URL: z.string().url().default('http://localhost:3006'),
      LLM_ORCHESTRATOR_SERVICE_ACCOUNT_TOKEN: z.string().min(1),

      // services/api — fetch agent config at call-start
      API_SERVICE_URL: z.string().url().default('http://localhost:3000'),
      API_INTERNAL_SERVICE_TOKEN: z.string().min(32),

      // Audio settings
      AUDIO_SAMPLE_RATE: z.coerce.number().default(48000), // must match tts-service's Cartesia output sample rate
      AUDIO_CHANNELS: z.coerce.number().default(1),
      // How many ms of silence before finalizing the current utterance (supplement
      // to Deepgram's own VAD, which may not always fire utterance_end perfectly).
      SILENCE_TIMEOUT_MS: z.coerce.number().default(1500),
      // OpenAI Realtime API
      OPENAI_API_KEY: z.string().optional(),
      OPENAI_REALTIME_MODEL: z.string().default('gpt-4o-realtime-preview-2024-12-17'),
      OPENAI_REALTIME_VOICE: z.string().default('alloy'),
    }),
  );

export type VoiceRuntimeEnv = z.infer<typeof voiceRuntimeEnvSchema>;
