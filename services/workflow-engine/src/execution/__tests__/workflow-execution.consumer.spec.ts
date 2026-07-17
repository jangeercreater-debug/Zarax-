import { asTenantId } from '@zarax/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let capturedHandler: ((job: { data: Record<string, unknown> }) => Promise<void>) | undefined;
const addMock = vi.fn();

vi.mock('@zarax/job-queue', () => ({
  JobQueue: vi.fn().mockImplementation(() => ({
    add: addMock,
    process: vi.fn((handler: typeof capturedHandler) => {
      capturedHandler = handler;
    }),
    close: vi.fn(),
  })),
}));

import { WorkflowExecutionConsumer } from '../workflow-execution.consumer';

function buildFakeExecutorMap() {
  return {
    trigger: { nodeType: 'trigger', execute: vi.fn(async (_n: unknown, ctx: { context: Record<string, unknown> }) => ({ output: ctx.context.input })) },
    ai_agent: { nodeType: 'ai_agent', execute: vi.fn(async () => ({ output: { response: 'hi' } })) },
    knowledge_base: { nodeType: 'knowledge_base', execute: vi.fn(async () => ({ output: { results: [] } })) },
    condition: { nodeType: 'condition', execute: vi.fn(async () => ({ output: {}, branch: 'true' as const })) },
    delay: { nodeType: 'delay', execute: vi.fn(async () => ({ output: { durationMs: 1000 }, pauseForMs: 1000 })) },
    webhook: { nodeType: 'webhook', execute: vi.fn(async () => ({ output: { ok: true } })) },
    email: { nodeType: 'email', execute: vi.fn(async () => ({ output: { sent: false } })) },
    end: { nodeType: 'end', execute: vi.fn(async () => ({ output: { done: true } })) },
  };
}

function buildFakePrisma(workflowDefinition: Record<string, unknown>, executionOverrides: Record<string, unknown> = {}) {
  const execution = {
    id: 'exec-1',
    workflowId: 'wf-1',
    tenantId: 'tenant-1',
    status: 'pending',
    triggerType: 'manual',
    input: {},
    output: null,
    errorMessage: null,
    nodeExecutions: [],
    startedAt: new Date(),
    completedAt: null,
    ...executionOverrides,
  };

  return {
    _execution: execution,
    workflow: {
      findFirst: vi.fn(async () => ({
        id: 'wf-1',
        tenantId: 'tenant-1',
        name: 'W',
        description: null,
        isActive: false,
        definition: workflowDefinition,
        currentVersion: 1,
        deletedAt: null,
      })),
    },
    workflowExecution: {
      findFirst: vi.fn(async () => execution),
      findUniqueOrThrow: vi.fn(async () => execution),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(execution, data);
        return execution;
      }),
    },
  };
}

function buildConsumer(prisma: ReturnType<typeof buildFakePrisma>, executors: ReturnType<typeof buildFakeExecutorMap>) {
  const auditLogService = { recordSystemEvent: vi.fn() };
  return new WorkflowExecutionConsumer(
    executors.trigger as never,
    executors.ai_agent as never,
    executors.knowledge_base as never,
    executors.condition as never,
    executors.delay as never,
    executors.webhook as never,
    executors.email as never,
    executors.end as never,
    prisma as never,
    auditLogService as never,
    { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } as never,
  );
}

describe('WorkflowExecutionConsumer', () => {
  beforeEach(() => {
    capturedHandler = undefined;
    addMock.mockClear();
  });

  it('runs a linear trigger -> ai_agent -> end workflow to completion', async () => {
    const definition = {
      nodes: [
        { id: 'n1', type: 'trigger', data: {} },
        { id: 'n2', type: 'ai_agent', data: { agentId: 'agent-1' } },
        { id: 'n3', type: 'end', data: {} },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3' },
      ],
    };
    const prisma = buildFakePrisma(definition);
    const executors = buildFakeExecutorMap();
    buildConsumer(prisma, executors);

    await capturedHandler!({ data: { executionId: 'exec-1', workflowId: 'wf-1', tenantId: 'tenant-1' } });

    expect(executors.ai_agent.execute).toHaveBeenCalled();
    expect(executors.end.execute).toHaveBeenCalled();
    expect(prisma._execution.status).toBe('completed');
  });

  it('follows the true branch of a condition node', async () => {
    const definition = {
      nodes: [
        { id: 'n1', type: 'trigger', data: {} },
        { id: 'n2', type: 'condition', data: {} },
        { id: 'n3', type: 'ai_agent', data: {} },
        { id: 'n4', type: 'webhook', data: {} },
        { id: 'n5', type: 'end', data: {} },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3', sourceHandle: 'true' },
        { id: 'e3', source: 'n2', target: 'n4', sourceHandle: 'false' },
        { id: 'e4', source: 'n3', target: 'n5' },
        { id: 'e5', source: 'n4', target: 'n5' },
      ],
    };
    const prisma = buildFakePrisma(definition);
    const executors = buildFakeExecutorMap(); // condition mock always returns branch: 'true'
    buildConsumer(prisma, executors);

    await capturedHandler!({ data: { executionId: 'exec-1', workflowId: 'wf-1', tenantId: 'tenant-1' } });

    expect(executors.ai_agent.execute).toHaveBeenCalled(); // the true branch
    expect(executors.webhook.execute).not.toHaveBeenCalled(); // NOT the false branch
  });

  it('a delay node pauses execution by re-enqueueing rather than continuing immediately', async () => {
    const definition = {
      nodes: [
        { id: 'n1', type: 'trigger', data: {} },
        { id: 'n2', type: 'delay', data: { durationMs: 5000 } },
        { id: 'n3', type: 'end', data: {} },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3' },
      ],
    };
    const prisma = buildFakePrisma(definition);
    const executors = buildFakeExecutorMap();
    buildConsumer(prisma, executors);

    await capturedHandler!({ data: { executionId: 'exec-1', workflowId: 'wf-1', tenantId: 'tenant-1' } });

    expect(executors.end.execute).not.toHaveBeenCalled(); // did not run past the delay in this invocation
    expect(addMock).toHaveBeenCalledWith(
      'execute',
      expect.objectContaining({ resumeFromNodeId: 'n3' }),
      { delayMs: 5000 },
    );
    expect(prisma._execution.status).not.toBe('completed'); // still in-flight, waiting on the continuation job
  });

  it('a resumed job (resumeFromNodeId set) continues from after the delay, not from the trigger', async () => {
    const definition = {
      nodes: [
        { id: 'n1', type: 'trigger', data: {} },
        { id: 'n2', type: 'delay', data: { durationMs: 5000 } },
        { id: 'n3', type: 'end', data: {} },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3' },
      ],
    };
    const prisma = buildFakePrisma(definition, {
      nodeExecutions: [
        { nodeId: 'n1', nodeType: 'trigger', status: 'completed', input: {}, output: {}, startedAt: '', completedAt: '' },
        { nodeId: 'n2', nodeType: 'delay', status: 'completed', input: {}, output: { durationMs: 5000 }, startedAt: '', completedAt: '' },
      ],
    });
    const executors = buildFakeExecutorMap();
    buildConsumer(prisma, executors);

    await capturedHandler!({
      data: { executionId: 'exec-1', workflowId: 'wf-1', tenantId: 'tenant-1', resumeFromNodeId: 'n3' },
    });

    expect(executors.trigger.execute).not.toHaveBeenCalled(); // did not restart from the beginning
    expect(executors.end.execute).toHaveBeenCalled();
    expect(prisma._execution.status).toBe('completed');
  });

  it('marks the execution failed when a node throws, and does not run subsequent nodes', async () => {
    const definition = {
      nodes: [
        { id: 'n1', type: 'trigger', data: {} },
        { id: 'n2', type: 'ai_agent', data: {} },
        { id: 'n3', type: 'end', data: {} },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3' },
      ],
    };
    const prisma = buildFakePrisma(definition);
    const executors = buildFakeExecutorMap();
    executors.ai_agent.execute.mockRejectedValue(new Error('LLM provider down'));
    buildConsumer(prisma, executors);

    await capturedHandler!({ data: { executionId: 'exec-1', workflowId: 'wf-1', tenantId: 'tenant-1' } });

    expect(executors.end.execute).not.toHaveBeenCalled();
    expect(prisma._execution.status).toBe('failed');
    expect(prisma._execution.errorMessage).toContain('LLM provider down');
  });
});
