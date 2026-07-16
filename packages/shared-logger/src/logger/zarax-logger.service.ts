import { Injectable, type LoggerService } from '@nestjs/common';
import type { Logger as PinoLogger } from 'pino';

import { createLogger } from './create-logger';

export interface ZaraxLoggerOptions {
  serviceName: string;
  level?: string;
  pretty?: boolean;
}

/**
 * Implements Nest's `LoggerService` (so it can replace the default logger via
 * `app.useLogger(...)`) and additionally satisfies `@zarax/shared-errors`'
 * `ErrorFilterLogger` interface structurally — no import of that package needed here,
 * avoiding a Layer-1-to-Layer-1 sideways dependency (see docs/dependency-rules.md).
 */
@Injectable()
export class ZaraxLogger implements LoggerService {
  private readonly pino: PinoLogger;

  constructor(options: ZaraxLoggerOptions) {
    this.pino = createLogger(options);
  }

  log(message: string, meta?: Record<string, unknown>): void {
    this.pino.info(meta ?? {}, message);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.pino.error(meta ?? {}, message);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.pino.warn(meta ?? {}, message);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.pino.debug(meta ?? {}, message);
  }

  verbose(message: string, meta?: Record<string, unknown>): void {
    this.pino.trace(meta ?? {}, message);
  }

  fatal(message: string, meta?: Record<string, unknown>): void {
    this.pino.fatal(meta ?? {}, message);
  }

  /** Escape hatch for callers that want a child logger scoped to a sub-component. */
  child(bindings: Record<string, unknown>): PinoLogger {
    return this.pino.child(bindings);
  }
}
