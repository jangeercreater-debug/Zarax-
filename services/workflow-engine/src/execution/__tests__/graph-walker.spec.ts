import { describe, expect, it } from 'vitest';

import { findNextNode, findTriggerNode, getNodeById, type WorkflowGraph } from '../graph-walker';

const linearGraph: WorkflowGraph = {
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

const branchingGraph: WorkflowGraph = {
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

describe('graph-walker', () => {
  it('finds the trigger node', () => {
    expect(findTriggerNode(linearGraph)?.id).toBe('n1');
  });

  it('returns undefined when there is no trigger node', () => {
    expect(findTriggerNode({ nodes: [], edges: [] })).toBeUndefined();
  });

  it('follows the single outgoing edge for a non-branching node', () => {
    expect(findNextNode(linearGraph, 'n1')?.id).toBe('n2');
    expect(findNextNode(linearGraph, 'n2')?.id).toBe('n3');
  });

  it('returns undefined at the end of the graph', () => {
    expect(findNextNode(linearGraph, 'n3')).toBeUndefined();
  });

  it('follows the true branch when the condition result is true', () => {
    expect(findNextNode(branchingGraph, 'n2', 'true')?.id).toBe('n3');
  });

  it('follows the false branch when the condition result is false', () => {
    expect(findNextNode(branchingGraph, 'n2', 'false')?.id).toBe('n4');
  });

  it('both branches converge back to the same end node', () => {
    expect(findNextNode(branchingGraph, 'n3')?.id).toBe('n5');
    expect(findNextNode(branchingGraph, 'n4')?.id).toBe('n5');
  });

  it('getNodeById finds a node by id', () => {
    expect(getNodeById(linearGraph, 'n2')?.type).toBe('ai_agent');
  });
});
