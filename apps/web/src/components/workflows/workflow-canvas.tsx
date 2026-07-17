'use client';

import { useCallback, useMemo, useState } from 'react';
import ReactFlow, {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  MiniMap,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { getNodeTypeMeta } from '@/lib/workflow-node-types';
import type { WorkflowDefinition, WorkflowNode } from '@/lib/types';
import { NodePalette } from './node-palette';
import { NodePropertiesPanel } from './node-properties-panel';
import { WorkflowNodeCard, type WorkflowNodeCardData } from './workflow-node-card';

const NODE_TYPES = { workflowNode: WorkflowNodeCard };

function toReactFlowNode(node: WorkflowNode): Node<WorkflowNodeCardData> {
  return {
    id: node.id,
    type: 'workflowNode',
    position: node.position,
    data: { nodeType: node.type, label: node.label, summary: summarize(node) },
  };
}

function summarize(node: WorkflowNode): string | undefined {
  switch (node.type) {
    case 'ai_agent':
      return node.data.agentId ? String(node.data.agentId) : undefined;
    case 'condition':
      return node.data.field ? `${node.data.field} ${node.data.operator ?? ''}` : undefined;
    case 'delay':
      return node.data.durationMs ? `${Math.round(Number(node.data.durationMs) / 1000)}s` : undefined;
    case 'webhook':
    case 'http_request':
      return node.data.url ? String(node.data.url) : undefined;
    default:
      return undefined;
  }
}

let nodeIdCounter = 0;
function generateNodeId(): string {
  nodeIdCounter += 1;
  return `node-${Date.now()}-${nodeIdCounter}`;
}

interface WorkflowCanvasProps {
  definition: WorkflowDefinition;
  onChange: (definition: WorkflowDefinition) => void;
  readOnly?: boolean;
}

export function WorkflowCanvas({ definition, onChange, readOnly = false }: WorkflowCanvasProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const flowNodes = useMemo(() => definition.nodes.map(toReactFlowNode), [definition.nodes]);
  const flowEdges = useMemo<Edge[]>(
    () =>
      definition.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        animated: false,
      })),
    [definition.edges],
  );

  const selectedNode = definition.nodes.find((n) => n.id === selectedNodeId) ?? null;
  const existingTypes = definition.nodes.map((n) => n.type);
  const disabledPaletteTypes = existingTypes.includes('trigger') ? (['trigger'] as const) : [];

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const updatedFlowNodes = applyNodeChanges(changes, flowNodes);
      const positionById = new Map(updatedFlowNodes.map((n) => [n.id, n.position]));
      const removedIds = new Set(
        changes.filter((c): c is NodeChange & { type: 'remove' } => c.type === 'remove').map((c) => c.id),
      );

      onChange({
        nodes: definition.nodes
          .filter((n) => !removedIds.has(n.id))
          .map((n) => ({ ...n, position: positionById.get(n.id) ?? n.position })),
        edges: definition.edges.filter((e) => !removedIds.has(e.source) && !removedIds.has(e.target)),
      });
      if (selectedNodeId && removedIds.has(selectedNodeId)) setSelectedNodeId(null);
    },
    [definition, flowNodes, onChange, selectedNodeId],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const updatedFlowEdges = applyEdgeChanges(changes, flowEdges);
      onChange({
        nodes: definition.nodes,
        edges: updatedFlowEdges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle ?? undefined,
          targetHandle: e.targetHandle ?? undefined,
        })),
      });
    },
    [definition, flowEdges, onChange],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      const updatedFlowEdges = addEdge(connection, flowEdges);
      onChange({
        nodes: definition.nodes,
        edges: updatedFlowEdges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle ?? undefined,
          targetHandle: e.targetHandle ?? undefined,
        })),
      });
    },
    [definition, flowEdges, onChange],
  );

  function handleAddNode(type: WorkflowNode['type']) {
    const meta = getNodeTypeMeta(type);
    const newNode: WorkflowNode = {
      id: generateNodeId(),
      type,
      position: { x: 250, y: 100 + definition.nodes.length * 90 },
      data: {},
      label: meta.label,
    };
    onChange({ nodes: [...definition.nodes, newNode], edges: definition.edges });
    setSelectedNodeId(newNode.id);
  }

  function handleNodeDataChange(nodeId: string, data: Record<string, unknown>) {
    onChange({
      nodes: definition.nodes.map((n) => (n.id === nodeId ? { ...n, data } : n)),
      edges: definition.edges,
    });
  }

  function handleNodeLabelChange(nodeId: string, label: string) {
    onChange({
      nodes: definition.nodes.map((n) => (n.id === nodeId ? { ...n, label } : n)),
      edges: definition.edges,
    });
  }

  function handleDeleteNode(nodeId: string) {
    onChange({
      nodes: definition.nodes.filter((n) => n.id !== nodeId),
      edges: definition.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
    });
    setSelectedNodeId(null);
  }

  return (
    <div className="flex h-[70vh] min-h-[500px] w-full overflow-hidden rounded-lg border">
      {!readOnly && <NodePalette onAddNode={handleAddNode} disabledTypes={[...disabledPaletteTypes]} />}

      <div className="min-w-0 flex-1">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={NODE_TYPES}
          onNodesChange={readOnly ? undefined : handleNodesChange}
          onEdgesChange={readOnly ? undefined : handleEdgesChange}
          onConnect={readOnly ? undefined : handleConnect}
          onNodeClick={(_event, node) => setSelectedNodeId(node.id)}
          onPaneClick={() => setSelectedNodeId(null)}
          nodesDraggable={!readOnly}
          nodesConnectable={!readOnly}
          elementsSelectable={!readOnly}
          fitView
        >
          <Background />
          <Controls showInteractive={!readOnly} />
          <MiniMap pannable zoomable className="!bg-background" />
        </ReactFlow>
      </div>

      {!readOnly && selectedNode && (
        <NodePropertiesPanel
          node={selectedNode}
          onChange={handleNodeDataChange}
          onLabelChange={handleNodeLabelChange}
          onClose={() => setSelectedNodeId(null)}
          onDelete={handleDeleteNode}
        />
      )}
    </div>
  );
}
