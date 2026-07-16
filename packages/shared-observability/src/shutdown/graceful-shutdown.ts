import type { INestApplication } from '@nestjs/common';

export interface GracefulShutdownLogger {
  log(message: string): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface GracefulShutdownOptions {
  /** How long to wait for app.close() before forcing process.exit(1). */
  timeoutMs?: number;
  logger?: GracefulShutdownLogger;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Call once in `main.ts`, right after `app.listen()`:
 *   setupGracefulShutdown(app, { logger });
 *
 * On SIGTERM/SIGINT: stops accepting new connections, lets in-flight requests finish,
 * runs every module's `onModuleDestroy`/`beforeApplicationShutdown` hooks (this is what
 * closes the Prisma connection pool, disconnects Redis, unsubscribes the event-bus,
 * etc. — see each package's own lifecycle hooks), then exits cleanly. If that takes
 * longer than `timeoutMs`, forces a hard exit rather than leaving the container/pod
 * stuck in a terminating state indefinitely.
 */
export function setupGracefulShutdown(
  app: INestApplication,
  options: GracefulShutdownOptions = {},
): void {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let isShuttingDown = false;

  const shutdown = (signal: string): void => {
    if (isShuttingDown) return; // A second signal during shutdown shouldn't restart the process.
    isShuttingDown = true;
    options.logger?.log(`Received ${signal} — shutting down gracefully.`);

    const forceExitTimer = setTimeout(() => {
      options.logger?.error(`Graceful shutdown exceeded ${timeoutMs}ms — forcing exit.`);
      process.exit(1);
    }, timeoutMs);
    forceExitTimer.unref(); // Never let this timer alone keep the process alive.

    app
      .close()
      .then(() => {
        clearTimeout(forceExitTimer);
        options.logger?.log('Graceful shutdown complete.');
        process.exit(0);
      })
      .catch((error: unknown) => {
        clearTimeout(forceExitTimer);
        options.logger?.error('Error during graceful shutdown', {
          error: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
      });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
