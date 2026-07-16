import type { PrismaClient } from '@zarax/database';
import type { EventBus, EventHandler } from '@zarax/event-bus';
import type { ZaraxLogger } from '@zarax/shared-logger';
import type { ZaraxEvent } from '@zarax/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToolExecutionConsumer } from '../tool-execution.consumer';
import { ToolRegistryService } from '../../tools/registry/tool-registry.service';
import { getCurrentDatetimeTool } from '../../tools/handlers/get-current-datetime.tool';

function buildFakeEventBus(): EventBus & { emit: (event: ZaraxEvent) => Promise<void> } {
  const handlers = new Map<string, EventHandler[]>();
  const published: ZaraxEvent[] = [];

  return {
    publish: vi.fn(async (event: ZaraxEvent) => {
      published.push(event);
    }),
    subscribe: vi.fn((eventType: string, handler: EventHandler) => {
      const existing = handlers.get(eventType) ?? [];
      existing.push(handler);
      handlers.set(eventType, existing);
    }),
    emit: async (event: ZaraxEvent) => {
      for (const handler of handlers.get(event.type) ?? []) await handler(event);
    },
    // expose for assertions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _published: published as any,
  } as unknown as EventBus & { emit: (event: ZaraxEvent) => Promise<void> };
}

const noopLogger = {
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  verbose: vi.fn(),
} as unknown as ZaraxLogger;

function buildFakePrisma(agentConfig: Record<string, unknown> = {}): PrismaClient {
  return {
    agent: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'agent-1',
        tenantId: 'tenant-1',
        name: 'Test Agent',
        isActive: true,
        config: agentConfig,
      }),
    },
  } as unknown as PrismaClient;
}

describe('ToolExecutionConsumer', () => {
  let eventBus: ReturnType<typeof buildFakeEventBus>;
  let registry: ToolRegistryService;

  beforeEach(() => {
    eventBus = buildFakeEventBus();
    registry = new ToolRegistryService();
    registry.register(getCurrentDatetimeTool);
  });

  it('executes a known tool and publishes a success completion event', async () => {
    const consumer = new ToolExecutionConsumer(eventBus, registry, buildFakePrisma(), noopLogger);
    consumer.onModuleInit();

    await eventBus.emit({
      type: 'tool.execution_requested',
      version: 1,
      eventId: 'e1',
      tenantId: 'tenant-1' as never,
      correlationId: 'corr-1',
      occurredAt: new Date().toISOString(),
      payload: { requestId: 'req-1', callId: 'call-1', agentId: 'agent-1', toolName: 'get_current_datetime', arguments: {} },
    });

    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    const published = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(published.type).toBe('tool.execution_completed');
    expect(published.payload.status).toBe('success');
    expect(published.payload.requestId).toBe('req-1');
  });

  it('publishes a failure completion event for an unknown tool', async () => {
    const consumer = new ToolExecutionConsumer(eventBus, registry, buildFakePrisma(), noopLogger);
    consumer.onModuleInit();

    await eventBus.emit({
      type: 'tool.execution_requested',
      version: 1,
      eventId: 'e2',
      tenantId: 'tenant-1' as never,
      correlationId: 'corr-2',
      occurredAt: new Date().toISOString(),
      payload: { requestId: 'req-2', callId: 'call-1', agentId: 'agent-1', toolName: 'not_a_real_tool', arguments: {} },
    });

    const published = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(published.payload.status).toBe('failure');
    expect(published.payload.errorMessage).toMatch(/not_a_real_tool/);
  });

  it('publishes a failure completion event when tool arguments fail validation', async () => {
    const consumer = new ToolExecutionConsumer(eventBus, registry, buildFakePrisma(), noopLogger);
    consumer.onModuleInit();

    await eventBus.emit({
      type: 'tool.execution_requested',
      version: 1,
      eventId: 'e3',
      tenantId: 'tenant-1' as never,
      correlationId: 'corr-3',
      occurredAt: new Date().toISOString(),
      payload: {
        requestId: 'req-3',
        callId: 'call-1',
        agentId: 'agent-1',
        toolName: 'get_current_datetime',
        arguments: { timezone: 12345 }, // wrong type — should fail zod validation
      },
    });

    const published = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(published.payload.status).toBe('failure');
  });
});
