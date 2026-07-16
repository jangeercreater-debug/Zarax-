import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { AgentRepository, PRISMA_CLIENT, type PrismaClient } from '@zarax/database';
import { createEvent, EVENT_BUS, type EventBus } from '@zarax/event-bus';
import { runWithRequestContext, ZARAX_LOGGER, type ZaraxLogger } from '@zarax/shared-logger';
import { asTenantId, type ToolExecutionRequestedEvent } from '@zarax/shared-types';

import { ToolRegistryService } from '../tools/registry/tool-registry.service';

@Injectable()
export class ToolExecutionConsumer implements OnModuleInit {
  private readonly agentRepository: AgentRepository;

  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    private readonly toolRegistry: ToolRegistryService,
    @Inject(PRISMA_CLIENT) prisma: PrismaClient,
    @Inject(ZARAX_LOGGER) private readonly logger: ZaraxLogger,
  ) {
    this.agentRepository = new AgentRepository(prisma);
  }

  onModuleInit(): void {
    this.eventBus.subscribe('tool.execution_requested', (event) => {
      // Every log line emitted while handling this event carries the originating
      // voice session's correlationId, tying it back to the LiveKit call, STT, and
      // LLM hops that led here.
      runWithRequestContext({ correlationId: event.correlationId }, () => {
        void this.handle(event);
      });
    });
  }

  private async handle(event: ToolExecutionRequestedEvent): Promise<void> {
    const startedAt = Date.now();
    const { requestId, callId, agentId, toolName, arguments: rawArgs } = event.payload;
    const tenantId = event.tenantId;

    let status: 'success' | 'failure' = 'success';
    let result: Record<string, unknown> | undefined;
    let errorMessage: string | undefined;

    try {
      const tool = this.toolRegistry.get(toolName); // throws NotFoundError if the tool is unknown
      const parsedArgs = tool.parameters.parse(rawArgs); // throws if the LLM's arguments don't validate

      const agent = await this.agentRepository.findByIdForTenant(asTenantId(tenantId), agentId);
      const agentConfig = agent?.config ?? {};

      result = await tool.handler(parsedArgs, { tenantId, callId, agentConfig });
    } catch (error) {
      status = 'failure';
      errorMessage = error instanceof Error ? error.message : 'Unknown tool execution error';
      this.logger.error('Tool execution failed', { requestId, toolName, callId, message: errorMessage });
    }

    const durationMs = Date.now() - startedAt;
    const completedEvent = createEvent({
      type: 'tool.execution_completed',
      tenantId: asTenantId(tenantId),
      correlationId: event.correlationId,
      payload: { requestId, callId, toolName, status, result, errorMessage, durationMs },
    });

    await this.eventBus.publish(completedEvent);
  }
}
