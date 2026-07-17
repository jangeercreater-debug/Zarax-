import { WebhookDeliveryRepository, type PrismaClient } from '@zarax/database';
import type { TenantId } from '@zarax/shared-types';
import type { Job } from 'bullmq';

import { JobQueue, type JobQueueLogger } from '../queue/job-queue';

interface WebhookJobData {
  deliveryId: string;
  url: string;
  payload: Record<string, unknown>;
}

export interface WebhookDeliveryServiceOptions {
  redisUrl: string;
  logger?: JobQueueLogger;
  /** Total attempts before giving up and marking dead_letter. Default 6 (with
   * exponential backoff starting at 2s, this spans several minutes of retrying
   * before giving up — enough to ride out a brief outage on the receiving end). */
  maxAttempts?: number;
}

/**
 * The concrete webhook-retry system built on @zarax/job-queue's generic dead-letter
 * queue. Any service can enqueue a webhook (e.g. tool-executor's
 * send_webhook_notification tool, or a future event-subscription feature) without
 * owning retry logic itself.
 */
export class WebhookDeliveryService {
  private readonly repository: WebhookDeliveryRepository;
  private readonly jobQueue: JobQueue<WebhookJobData>;

  constructor(prisma: PrismaClient, options: WebhookDeliveryServiceOptions) {
    this.repository = new WebhookDeliveryRepository(prisma);
    this.jobQueue = new JobQueue<WebhookJobData>({
      name: 'webhook-delivery',
      redisUrl: options.redisUrl,
      attempts: options.maxAttempts ?? 6,
      backoffDelayMs: 2000,
      logger: options.logger,
      onDeadLetter: async (data) => {
        await this.repository.markDeadLetter(data.originalData.deliveryId, data.failureReason);
      },
    });

    this.jobQueue.process((job: Job<WebhookJobData>) => this.attemptDelivery(job.data));
  }

  /** Persists the delivery record and enqueues the first attempt. Returns
   * immediately — delivery (and all retries) happen asynchronously via the worker. */
  async enqueue(params: {
    tenantId: TenantId;
    url: string;
    payload: Record<string, unknown>;
  }): Promise<string> {
    const record = await this.repository.create(params);
    await this.jobQueue.add('deliver', {
      deliveryId: record.id,
      url: params.url,
      payload: params.payload,
    });
    return record.id;
  }

  private async attemptDelivery(data: WebhookJobData): Promise<void> {
    try {
      const response = await fetch(data.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data.payload),
      });

      if (!response.ok) {
        throw new Error(`Webhook endpoint responded with HTTP ${response.status}`);
      }

      await this.repository.markDelivered(data.deliveryId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown delivery error';
      await this.repository.markFailedAttempt(data.deliveryId, message);
      throw error; // Rethrow so BullMQ schedules the next retry per its backoff config.
    }
  }

  async close(): Promise<void> {
    await this.jobQueue.close();
  }
}
