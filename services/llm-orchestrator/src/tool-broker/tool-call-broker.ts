import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { createEvent, EVENT_BUS, type EventBus } from '@zarax/event-bus';
import { ExternalServiceError, TimeoutError } from '@zarax/shared-errors';
import type { TenantId, ToolExecutionCompletedPayload } from '@zarax/shared-types';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_TIMEOUT_MS = 15_000;

interface PendingRequest {
  resolve: (payload: ToolExecutionCompletedPayload) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

@Injectable()
export class ToolCallBroker implements OnModuleInit {
  private readonly pending = new Map<string, PendingRequest>();

  constructor(@Inject(EVENT_BUS) private readonly eventBus: EventBus) {}

  onModuleInit(): void {
    this.eventBus.subscribe('tool.execution_completed', (event) => {
      const request = this.pending.get(event.payload.requestId);
      if (!request) return; // Not one of ours (or already timed out) — ignore.

      clearTimeout(request.timer);
      this.pending.delete(event.payload.requestId);
      request.resolve(event.payload);
    });
  }

  /**
   * Publishes a tool execution request and returns a promise that resolves once
   * tool-executor's corresponding `tool.execution_completed` event arrives — turning
   * the fire-and-forget event bus into a request/reply call for this one purpose.
   */
  async requestToolExecution(params: {
    tenantId: TenantId;
    callId: string;
    agentId: string;
    toolName: string;
    arguments: Record<string, unknown>;
    timeoutMs?: number;
  }): Promise<ToolExecutionCompletedPayload> {
    const requestId = uuidv4();
    const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const resultPromise = new Promise<ToolExecutionCompletedPayload>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new TimeoutError(`tool-executor.${params.toolName}`, timeoutMs));
      }, timeoutMs);
      timer.unref();

      this.pending.set(requestId, { resolve, reject, timer });
    });

    const event = createEvent({
      type: 'tool.execution_requested',
      tenantId: params.tenantId,
      payload: {
        requestId,
        callId: params.callId,
        agentId: params.agentId,
        toolName: params.toolName,
        arguments: params.arguments,
      },
    });

    try {
      await this.eventBus.publish(event);
    } catch (error) {
      this.pending.delete(requestId);
      throw new ExternalServiceError(
        'event-bus',
        error instanceof Error ? error.message : 'Failed to publish tool execution request',
      );
    }

    return resultPromise;
  }
}
