import { z } from 'zod';

/** Every service needs these — bootstrap/runtime basics. */
export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DEPLOYMENT_REGION: z.string().default('local'),
});

export const postgresEnvSchema = z.object({
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
});

export const redisEnvSchema = z.object({
  REDIS_URL: z.string().url().startsWith('redis://').or(z.string().url().startsWith('rediss://')),
});

export const qdrantEnvSchema = z.object({
  QDRANT_URL: z.string().url(),
  QDRANT_API_KEY: z.string().min(1).optional(),
});

export const jwtEnvSchema = z.object({
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
});

export const eventBusEnvSchema = z.object({
  EVENT_BUS_REDIS_URL: z
    .string()
    .url()
    .startsWith('redis://')
    .or(z.string().url().startsWith('rediss://')),
});

export const observabilityEnvSchema = z.object({
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  METRICS_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
});

/** Third-party AI provider credentials — only required by services that call them directly. */
export const aiProvidersEnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  GROQ_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  DEEPGRAM_API_KEY: z.string().min(1).optional(),
  CARTESIA_API_KEY: z.string().min(1).optional(),
  LIVEKIT_API_KEY: z.string().min(1).optional(),
  LIVEKIT_API_SECRET: z.string().min(1).optional(),
  LIVEKIT_URL: z.string().url().optional(),
});
