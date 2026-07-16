import pino, { type Logger as PinoLogger } from 'pino';

import { getRequestContext } from '../context/request-context';

export interface CreateLoggerOptions {
  serviceName: string;
  level?: string;
  /** Pretty-print for local development. Never enable in production (breaks log aggregation). */
  pretty?: boolean;
}

const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  '*.password',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.apiKey',
  '*.secret',
  '*.jwtSecret',
];

/**
 * Creates a service-scoped pino instance. Every log line automatically includes the
 * current request's `correlationId`/`tenantId` (via the `mixin`, pulled from
 * AsyncLocalStorage) without callers having to pass it manually on every `.info()` call.
 */
export function createLogger(options: CreateLoggerOptions): PinoLogger {
  return pino({
    name: options.serviceName,
    level: options.level ?? 'info',
    redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
    mixin() {
      const ctx = getRequestContext();
      return ctx
        ? { correlationId: ctx.correlationId, tenantId: ctx.tenantId, principalId: ctx.principalId }
        : {};
    },
    transport: options.pretty
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss.l' } }
      : undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
