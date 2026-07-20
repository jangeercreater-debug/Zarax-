import { TimeoutError } from '@zarax/shared-errors';
import type { ZaraxLogger } from '@zarax/shared-logger';
import { asTenantId, type ZaraxEvent } from '@zarax/shared-types';
import { describe, expect, it, vi } from 'vitest';

import { ToolCallBroker } from '../tool-call-broker';

function buildFakeEventBus() {
  const handlers = new Map<string, ((event: ZaraxEvent) => void)[]>();
  return {
    publish: vi.fn(async () => undefined),
    subscribe: vi.fn((eventType: string, handler: (event: ZaraxEvent) => void) => {
      const existing = handlers.get(eventType) ?? [];
      existing.push(handler);
      handlers.set(eventType, existing);
    }),
    emit: (event: ZaraxEvent) => {
      for (const handler of handlers.get(event.type) ?? []) handler(event);
    },
  };
}

const noopLogger = { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), verbose: vi.fn() } as unknown as ZaraxLogger;

describe('ToolCallBroker', () => {
  it('resolves with the matching completed event payload', async () => {
    const eventBus = buildFakeEventBus();
    const broker = new ToolCallBroker(eventBus as never, noopLogger);
    broker.onModuleInit();

    const resultPromise = broker.requestToolExecution({
      tenantId: asTenantId('tenant-1'),
      callId: 'call-1',
      agentId: 'agent-1',
      toolName: 'get_current_datetime',
      arguments: {},
    });

    // Grab the requestId the broker actually published so we can reply to it.
    const publishedEvent = eventBus.publish.mock.calls[0]![0] as unknown as ZaraxEvent & {
      payload: { requestId: string };
    };

    eventBus.emit({
      type: 'tool.execution_completed',
      version: 1,
      eventId: 'e1',
      tenantId: asTenantId('tenant-1'),
      correlationId: 'corr-1',
      occurredAt: new Date().toISOString(),
      payload: {
        requestId: publishedEvent.payload.requestId,
        callId: 'call-1',
        toolName: 'get_current_datetime',
        status: 'success',
        result: { iso: '2026-01-01T00:00:00.000Z' },
        durationMs: 5,
      },
    });

    const result = await resultPromise;
    expect(result.status).toBe('success');
    expect(result.result).toEqual({ iso: '2026-01-01T00:00:00.000Z' });
  });

  it('rejects with TimeoutError if no completion arrives in time', async () => {
    const eventBus = buildFakeEventBus();
    const broker = new ToolCallBroker(eventBus as never, noopLogger);
    broker.onModuleInit();

    await expect(
      broker.requestToolExecution({
        tenantId: asTenantId('tenant-1'),
        callId: 'call-1',
        agentId: 'agent-1',
        toolName: 'slow_tool',
        arguments: {},
        timeoutMs: 20,
      }),
    ).rejects.toThrow(TimeoutError);
  });

  it('ignores completion events for unrelated/unknown requestIds', async () => {
    const eventBus = buildFakeEventBus();
    const broker = new ToolCallBroker(eventBus as never, noopLogger);
    broker.onModuleInit();

    // Should not throw or affect anything — just verifying no crash on a stray event.
    expect(() =>
      eventBus.emit({
        type: 'tool.execution_completed',
        version: 1,
        eventId: 'e2',
        tenantId: asTenantId('tenant-1'),
        correlationId: 'corr-2',
        occurredAt: new Date().toISOString(),
        payload: {
          requestId: 'no-such-request',
          callId: 'call-1',
          toolName: 'x',
          status: 'success',
          durationMs: 1,
        },
      }),
    ).not.toThrow();
  });
});
