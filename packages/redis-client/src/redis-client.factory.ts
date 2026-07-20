import Redis, { type RedisOptions } from 'ioredis';

export interface CreateRedisClientOptions {
  url: string;
  /** BullMQ's Queue/Worker require this to be null on the connection they're given. */
  maxRetriesPerRequest?: number | null;
}

/**
 * One Redis connection per process per purpose (cache vs. pub/sub vs. BullMQ each want
 * their own connection — ioredis connections are not safely shareable across those
 * concerns because pub/sub puts a connection into a special subscriber mode).
 */
export function createRedisClient(options: CreateRedisClientOptions): Redis {
  const redisOptions: RedisOptions = {
    maxRetriesPerRequest:
      options.maxRetriesPerRequest === undefined ? 3 : options.maxRetriesPerRequest,
    retryStrategy: (attempt: number) => Math.min(attempt * 200, 5000),
    enableReadyCheck: true,
    lazyConnect: false,
  };

  return new Redis(options.url, redisOptions);
}
