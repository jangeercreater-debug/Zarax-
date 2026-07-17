export interface WorkflowNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

export interface NodeExecutionContext {
  tenantId: string;
  executionId: string;
  /** Accumulated outputs keyed by nodeId, plus `input` (the execution's seed input) —
   * a node's `data` config can reference an earlier node's output (e.g. a condition
   * node comparing `{{trigger.message}}`), resolved by the executor itself since only
   * it knows its own config shape. */
  context: Record<string, unknown>;
}

export interface NodeExecutionResult {
  /** Merged into `context[node.id]` for later nodes to reference. */
  output: unknown;
  /** Only meaningful for a 'condition' node — which outgoing edge (by sourceHandle)
   * to follow. Every other node type leaves this undefined, meaning "follow the
   * single outgoing edge" (see GraphWalker). */
  branch?: 'true' | 'false';
  /** Only set by the 'delay' node — tells the consumer to re-enqueue a continuation
   * job after this many milliseconds and stop processing in *this* invocation,
   * rather than blocking a worker thread for a potentially long wait. */
  pauseForMs?: number;
}

export interface NodeExecutor {
  readonly nodeType: string;
  execute(node: WorkflowNode, context: NodeExecutionContext): Promise<NodeExecutionResult>;
}
