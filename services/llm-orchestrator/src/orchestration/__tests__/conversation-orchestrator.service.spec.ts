import type { ZaraxLogger } from '@zarax/shared-logger';
import { asTenantId } from '@zarax/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConversationOrchestratorService } from '../conversation-orchestrator.service';

const noopLogger = {
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  verbose: vi.fn(),
} as unknown as ZaraxLogger;

function buildFakePrisma(agentConfig: Record<string, unknown>) {
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
  };
}

describe('ConversationOrchestratorService', () => {
  const tenantId = asTenantId('tenant-1');
  let conversationState: { getHistory: ReturnType<typeof vi.fn>; saveHistory: ReturnType<typeof vi.fn> };
  let aiRegistry: { get: ReturnType<typeof vi.fn>; completeWithFallback: ReturnType<typeof vi.fn> };
  let toolCatalog: { getAvailableTools: ReturnType<typeof vi.fn> };
  let toolBroker: { requestToolExecution: ReturnType<typeof vi.fn> };
  let ragClient: { search: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    conversationState = { getHistory: vi.fn().mockResolvedValue([]), saveHistory: vi.fn() };
    aiRegistry = { get: vi.fn(), completeWithFallback: vi.fn() };
    toolCatalog = { getAvailableTools: vi.fn().mockResolvedValue([]) };
    toolBroker = { requestToolExecution: vi.fn() };
    ragClient = { search: vi.fn() };
  });

  it('returns the assistant text directly when the LLM makes no tool calls', async () => {
    const complete = vi.fn().mockResolvedValue({
      content: 'Hello! How can I help?',
      toolCalls: [],
      stopReason: 'end_turn',
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    aiRegistry.get.mockReturnValue({ complete });

    const service = new ConversationOrchestratorService(
      conversationState as never,
      aiRegistry as never,
      toolCatalog as never,
      toolBroker as never,
      ragClient as never,
      buildFakePrisma({ systemPrompt: 'You are a helpful agent.' }) as never,
      noopLogger,
    );

    const result = await service.handleTurn(tenantId, 'call-1', 'agent-1', 'Hi there');

    expect(result).toEqual({ response: 'Hello! How can I help?', shouldEndCall: false, endCallReason: undefined });
    expect(conversationState.saveHistory).toHaveBeenCalled();
  });

  it('executes a tool call via the broker, then continues to a final answer', async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [{ id: 'tc1', name: 'get_current_datetime', arguments: {} }],
        stopReason: 'tool_use',
        usage: { inputTokens: 10, outputTokens: 5 },
      })
      .mockResolvedValueOnce({
        content: 'It is currently 3pm.',
        toolCalls: [],
        stopReason: 'end_turn',
        usage: { inputTokens: 15, outputTokens: 6 },
      });
    aiRegistry.get.mockReturnValue({ complete });
    toolCatalog.getAvailableTools.mockResolvedValue([
      { name: 'get_current_datetime', description: 'd', parameters: { type: 'object', properties: {} } },
    ]);
    toolBroker.requestToolExecution.mockResolvedValue({
      requestId: 'req-1',
      callId: 'call-1',
      toolName: 'get_current_datetime',
      status: 'success',
      result: { iso: '2026-01-01T15:00:00.000Z' },
      durationMs: 10,
    });

    const service = new ConversationOrchestratorService(
      conversationState as never,
      aiRegistry as never,
      toolCatalog as never,
      toolBroker as never,
      ragClient as never,
      buildFakePrisma({ enabledTools: ['get_current_datetime'] }) as never,
      noopLogger,
    );

    const result = await service.handleTurn(tenantId, 'call-1', 'agent-1', 'What time is it?');

    expect(result.response).toBe('It is currently 3pm.');
    expect(toolBroker.requestToolExecution).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: 'get_current_datetime' }),
    );
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('sets shouldEndCall when the end_call tool signals it', async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [{ id: 'tc1', name: 'end_call', arguments: { reason: 'completed' } }],
        stopReason: 'tool_use',
        usage: { inputTokens: 10, outputTokens: 5 },
      })
      .mockResolvedValueOnce({
        content: 'Goodbye!',
        toolCalls: [],
        stopReason: 'end_turn',
        usage: { inputTokens: 12, outputTokens: 3 },
      });
    aiRegistry.get.mockReturnValue({ complete });
    toolCatalog.getAvailableTools.mockResolvedValue([
      { name: 'end_call', description: 'd', parameters: { type: 'object', properties: {} } },
    ]);
    toolBroker.requestToolExecution.mockResolvedValue({
      requestId: 'req-1',
      callId: 'call-1',
      toolName: 'end_call',
      status: 'success',
      result: { shouldEndCall: true, reason: 'completed' },
      durationMs: 5,
    });

    const service = new ConversationOrchestratorService(
      conversationState as never,
      aiRegistry as never,
      toolCatalog as never,
      toolBroker as never,
      ragClient as never,
      buildFakePrisma({ enabledTools: ['end_call'] }) as never,
      noopLogger,
    );

    const result = await service.handleTurn(tenantId, 'call-1', 'agent-1', 'That is all, goodbye');

    expect(result.shouldEndCall).toBe(true);
    expect(result.endCallReason).toBe('completed');
  });

  it('degrades gracefully (continues without context) when RAG search fails', async () => {
    const complete = vi.fn().mockResolvedValue({
      content: 'Answer without extra context.',
      toolCalls: [],
      stopReason: 'end_turn',
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    aiRegistry.get.mockReturnValue({ complete });
    ragClient.search.mockRejectedValue(new Error('rag-service unreachable'));

    const service = new ConversationOrchestratorService(
      conversationState as never,
      aiRegistry as never,
      toolCatalog as never,
      toolBroker as never,
      ragClient as never,
      buildFakePrisma({ ragEnabled: true }) as never,
      noopLogger,
    );

    const result = await service.handleTurn(tenantId, 'call-1', 'agent-1', 'What is your refund policy?');

    expect(result.response).toBe('Answer without extra context.');
  });
});
