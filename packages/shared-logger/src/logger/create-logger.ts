import type { Logger as PinoLogger } from 'pino';
import pino from 'pino';

import { getRequestContext } from '../context/request-context';

const REDACTED_PATHS = [
  '*.password',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.apiKey',
  '*.secret',
  '*.jwtSecret',
];

export interface CreateLoggerOptions {
  serviceName: string;
  level?: string;
  pretty?: boolean;
}

export function createLogger(options: CreateLoggerOptions): PinoLogger {
  return pino({
    name: options.serviceName,
    level: options.level ?? 'info',
    redact: REDACTED_PATHS,
    mixin() {
      const ctx = getRequestContext();
      return ctx
        ? { correlationId: ctx.correlationId, tenantId: ctx.tenantId, principalId: ctx.principalId }
        : {};
    },
    ...(options.pretty
      ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss.l' } } }
      : {}),
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
