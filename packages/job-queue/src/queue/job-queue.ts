import { createRedisClient } from '@zarax/redis-client';
import { Queue, Worker, type Job } from 'bullmq';

export interface DeadLetterJobData<TData> {
  originalData: TData;
  originalJobName: string;
  failureReason: string;
  failedAt: string;
  attemptsMade: number;
}

export interface JobQueueLogger {
  error(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
}

export interface JobQueueOptions<TData = unknown> {
  name: string;
  redisUrl: string;
  /** Total attempts (including the first) before a job is moved to the dead-letter
   * queue. Default 5. */
  attempts?: number;
  /** Base delay for BullMQ's exponential backoff between attempts. Default 2000ms. */
  backoffDelayMs?: number;
  concurrency?: number;
  logger?: JobQueueLogger;
  /** Called after a job is successfully moved to the dead-letter queue — lets a
   * higher-level service (e.g. WebhookDeliveryService) react, such as updating its
   * own persisted record's status. */
  onDeadLetter?: (data: DeadLetterJobData<TData>) => void | Promise<void>;
}
/**
 * Wraps a BullMQ Queue + Worker pair with a companion dead-letter queue. A job that
 * exhausts all its retry attempts is moved to `{name}:dead-letter` (with the failure
 * reason and attempt count attached) instead of silently disappearing — someone can
 * inspect and manually replay/discard dead-lettered jobs later.
 */
export class JobQueue<TData, TResult = void> {
  readonly queue: Queue<TData, TResult>;
  readonly deadLetterQueue: Queue<DeadLetterJobData<TData>>;
  private worker?: Worker<TData, TResult>;

  constructor(private readonly options: JobQueueOptions<TData>) {
    const connection = createRedisClient({ url: options.redisUrl, maxRetriesPerRequest: null });
    this.queue = new Queue(options.name, { connection });
    this.deadLetterQueue = new Queue(`${options.name}:dead-letter`, { connection });
  }

  async add(jobName: string, data: TData, options: { delayMs?: number } = {}): Promise<void> {
    await this.queue.add(jobName, data, {
      attempts: this.options.attempts ?? 5,
      backoff: { type: 'exponential', delay: this.options.backoffDelayMs ?? 2000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: false, // stays visible in the main queue's failed list until moved to DLQ
      ...(options.delayMs ? { delay: options.delayMs } : {}),
    });
  }

  /**
   * Registers the processing function and starts consuming. Call once per process —
   * typically in a dedicated worker entrypoint, not inside a request handler.
   */
  process(handler: (job: Job<TData, TResult>) => Promise<TResult>): void {
    const workerConnection = createRedisClient({
      url: this.options.redisUrl,
      maxRetriesPerRequest: null,
    });

    this.worker = new Worker<TData, TResult>(this.options.name, handler, {
      connection: workerConnection,
      concurrency: this.options.concurrency ?? 5,
    });

    this.worker.on('failed', (job, error) => {
      if (!job) return;
      const maxAttempts = job.opts.attempts ?? 1;
      const isFinalAttempt = job.attemptsMade >= maxAttempts;

      if (isFinalAttempt) {
        const deadLetterData: DeadLetterJobData<TData> = {
          originalData: job.data,
          originalJobName: job.name,
          failureReason: error.message,
          failedAt: new Date().toISOString(),
          attemptsMade: job.attemptsMade,
        };

        void this.deadLetterQueue
          .add(job.name, deadLetterData)
          .then(() => this.options.onDeadLetter?.(deadLetterData))
          .catch((dlqError: unknown) => {
            this.options.logger?.error('Failed to enqueue dead-letter job', {
              queue: this.options.name,
              jobId: job.id,
              error: dlqError instanceof Error ? dlqError.message : String(dlqError),
            });
          });

        this.options.logger?.warn('Job exhausted all retries — moved to dead-letter queue', {
          queue: this.options.name,
          jobId: job.id,
          attemptsMade: job.attemptsMade,
          error: error.message,
        });
      }
    });
  }

  async close(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
    await this.deadLetterQueue.close();
  }
}
