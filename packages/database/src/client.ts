import { PrismaClient } from '@prisma/client';

export interface PrismaClientLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

let prismaSingleton: PrismaClient | undefined;

/**
 * One PrismaClient per process (Prisma's own recommendation) — its internal
 * connection pool is what makes every service safely stateless and
 * horizontally scalable without each request opening a new DB connection.
 */
export function createPrismaClient(logger?: PrismaClientLogger): PrismaClient {
  if (prismaSingleton) return prismaSingleton;

  const client = new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
    ],
  });

  if (logger) {
    // Prisma's event typings are awkward to import generically across versions;
    // `.on` accepts these event names at runtime regardless.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).$on('query', (event: { query: string; duration: number }) => {
      logger.debug('Prisma query executed', { query: event.query, durationMs: event.duration });
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).$on('error', (event: { message: string }) => {
      logger.error('Prisma client error', { message: event.message });
    });
  }

  prismaSingleton = client;
  return client;
}
