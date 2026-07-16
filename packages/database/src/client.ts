import { PrismaClient } from '@prisma/client';

export interface PrismaClientLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface CreatePrismaClientOptions {
  logger?: PrismaClientLogger;
  /** Caps this process's connection pool against Postgres — critical once a service
   * runs multiple replicas: N replicas × an uncapped pool can exhaust Postgres's
   * max_connections far faster than expected. Applied via Prisma's documented
   * `connection_limit` connection-string parameter. Defaults to Prisma's own default
   * (no override) if omitted. */
  poolMax?: number;
}

let prismaSingleton: PrismaClient | undefined;

function buildDatasourceUrl(poolMax?: number): string | undefined {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl || !poolMax) return baseUrl;

  const url = new URL(baseUrl);
  url.searchParams.set('connection_limit', String(poolMax));
  return url.toString();
}

/**
 * One PrismaClient per process (Prisma's own recommendation) — its internal
 * connection pool is what makes every service safely stateless and
 * horizontally scalable without each request opening a new DB connection.
 */
export function createPrismaClient(options: CreatePrismaClientOptions = {}): PrismaClient {
  if (prismaSingleton) return prismaSingleton;

  const datasourceUrl = buildDatasourceUrl(options.poolMax);

  const client = new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
    ],
    ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
  });

  if (options.logger) {
    const logger = options.logger;
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
