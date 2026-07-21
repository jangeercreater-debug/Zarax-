import { ResilientHttpClient } from '@zarax/resilience';
import { ValidationError } from '@zarax/shared-errors';
import { z } from 'zod';

import type { ToolDefinition, ToolExecutionContext } from '../registry/tool-definition.interface';

const paramsSchema = z.object({
  message: z.string().min(1).max(2000).describe('The notification message to deliver.'),
  urgency: z.enum(['low', 'normal', 'high']),
});

// Shared across every invocation of this tool in the process — a single outbound
// webhook target's retry/circuit-breaker/health state should persist across calls,
// not reset per-invocation (same reasoning as every other provider adapter in ZaraX).
const resilientHttpClient = new ResilientHttpClient({
  providerName: 'tool.send_webhook_notification',
  timeoutMs: 8000,
  retry: { maxAttempts: 3, baseDelayMs: 300, maxDelayMs: 3000 },
  circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30_000 },
  rateLimiter: { capacity: 20, refillPerSecond: 5 },
});

function getWebhookUrl(agentConfig: ToolExecutionContext['agentConfig']): string {
  const webhooks = agentConfig.webhooks as Record<string, unknown> | undefined;
  const url = webhooks?.notification;
  if (typeof url !== 'string' || !url) {
    throw new ValidationError(
      "This agent has no 'webhooks.notification' URL configured — cannot send a notification.",
    );
  }
  return url;
}

export const sendWebhookNotificationTool: ToolDefinition<z.infer<typeof paramsSchema>> = {
  name: 'send_webhook_notification',
  description:
    "Sends a notification to the tenant's configured webhook (e.g. to alert a human " +
    'team member during or after a call). Requires the agent to have a notification ' +
    'webhook URL configured.',
  parameters: paramsSchema,
  jsonSchema: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'The notification message to deliver.' },
      urgency: { type: 'string', enum: ['low', 'normal', 'high'] },
    },
    required: ['message'],
  },
  async handler(args, context) {
    const url = getWebhookUrl(context.agentConfig);

    const response = await resilientHttpClient.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: args.message,
        urgency: args.urgency,
        tenantId: context.tenantId,
        callId: context.callId,
        sentAt: new Date().toISOString(),
      }),
    });

    return { delivered: response.ok, statusCode: response.status };
  },
};
