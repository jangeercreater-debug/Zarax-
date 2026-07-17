export interface GraphNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface WorkflowGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Pure graph-traversal logic, deliberately separate from WorkflowExecutionConsumer's
 * job-queue/persistence concerns — easy to unit test exhaustively without mocking
 * BullMQ or Prisma. Supports single-path traversal with condition-based branching
 * (one of two next edges, chosen by the condition's true/false result) — not a full
 * DAG with joins/merges. A node with multiple outgoing edges and no branch semantics
 * (i.e. not a condition node) just follows the first one; workflow authors build
 * linear-with-branches flows, not arbitrary graphs, which covers every node type this
 * builder ships. */
export function findTriggerNode(graph: WorkflowGraph): GraphNode | undefined {
  return graph.nodes.find((n) => n.type === 'trigger');
}

export function findNextNode(
  graph: WorkflowGraph,
  currentNodeId: string,
  branch?: 'true' | 'false',
): GraphNode | undefined {
  const outgoing = graph.edges.filter((e) => e.source === currentNodeId);

  const edge = branch ? outgoing.find((e) => e.sourceHandle === branch) : outgoing[0];
  if (!edge) return undefined;

  return graph.nodes.find((n) => n.id === edge.target);
}

export function getNodeById(graph: WorkflowGraph, nodeId: string): GraphNode | undefined {
  return graph.nodes.find((n) => n.id === nodeId);
}
