import { ValidationError } from '@zarax/shared-errors';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sendWebhookNotificationTool } from '../send-webhook-notification.tool';

describe('sendWebhookNotificationTool', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws ValidationError when the agent has no notification webhook configured', async () => {
    await expect(
      sendWebhookNotificationTool.handler(
        { message: 'hi', urgency: 'normal' },
        { tenantId: 't1', callId: 'c1', agentConfig: {} },
      ),
    ).rejects.toThrow(ValidationError);
  });

  it('POSTs the message to the configured webhook and reports delivery status', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    const result = await sendWebhookNotificationTool.handler(
      { message: 'Customer needs a callback', urgency: 'high' },
      {
        tenantId: 't1',
        callId: 'c1',
        agentConfig: { webhooks: { notification: 'https://example.com/hook' } },
      },
    );

    expect(result).toEqual({ delivered: true, statusCode: 200 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.com/hook');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({ message: 'Customer needs a callback', urgency: 'high', tenantId: 't1' });
  });

  it('reports delivered: false on a non-OK response rather than throwing', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    const result = await sendWebhookNotificationTool.handler(
      { message: 'hi', urgency: 'normal' },
      { tenantId: 't1', callId: 'c1', agentConfig: { webhooks: { notification: 'https://example.com/hook' } } },
    );

    expect(result).toEqual({ delivered: false, statusCode: 500 });
  });
});
