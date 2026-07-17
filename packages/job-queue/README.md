# @zarax/job-queue

Layer 4 — BullMQ-backed background job queues with automatic dead-letter handling,
plus a concrete webhook-delivery retry system built on top. See
`docs/production-standards.md` items #2 and #3.

## JobQueue — the generic primitive

```ts
const queue = new JobQueue<MyJobData>({
  name: 'send-reminder',
  redisUrl: process.env.REDIS_URL!,
  attempts: 5,
  backoffDelayMs: 2000,
  logger,
});

// Producer side (e.g. inside a request handler):
await queue.add('reminder', { userId, message });

// Worker side (a dedicated process, not inline in a request handler):
queue.process(async (job) => {
  await sendReminder(job.data);
});
```

A job that exhausts every retry attempt is moved to `{name}:dead-letter` — inspect it
with `queue.deadLetterQueue`, or hook `onDeadLetter` to react (as
`WebhookDeliveryService` does, marking its own DB row `dead_letter`).

## WebhookDeliveryService — the concrete webhook retry system

```ts
const webhooks = new WebhookDeliveryService(prisma, { redisUrl, logger });
const deliveryId = await webhooks.enqueue({ tenantId, url, payload });
```

Every attempt (success, failure, and eventual dead-letter) is recorded in the
`webhook_deliveries` table (`@zarax/database`) — a tenant's failed webhook
integrations are visible and auditable, not silently dropped after retries are
exhausted.
