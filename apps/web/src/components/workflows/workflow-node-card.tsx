'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';

import { cn } from '@/lib/utils';
import { getNodeTypeMeta } from '@/lib/workflow-node-types';
import type { WorkflowNode } from '@/lib/types';

export interface WorkflowNodeCardData {
  nodeType: WorkflowNode['type'];
  label?: string;
  summary?: string;
}

/**
 * One generic node renderer parametrized by type, rather than nine near-identical
 * custom node components — the visual differences between node types are a
 * color/icon/handle-count, not a structurally different card layout.
 */
function WorkflowNodeCardComponent({ data, selected }: NodeProps<WorkflowNodeCardData>) {
  const meta = getNodeTypeMeta(data.nodeType);
  const Icon = meta.icon;
  const isTrigger = data.nodeType === 'trigger';
  const isEnd = data.nodeType === 'end';

  return (
    <div
      className={cn(
        'min-w-[180px] rounded-lg border-2 bg-card px-3 py-2 shadow-sm transition-shadow',
        meta.colorClass.split(' ')[0], // border-* class
        selected && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
      )}
    >
      {!isTrigger && <Handle type="target" position={Position.Left} className="!bg-muted-foreground" />}

      <div className="flex items-center gap-2">
        <Icon className={cn('h-4 w-4 shrink-0', meta.colorClass.split(' ').slice(1).join(' '))} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{data.label || meta.label}</p>
          {data.summary && <p className="truncate text-xs text-muted-foreground">{data.summary}</p>}
        </div>
      </div>

      {!isEnd && !meta.hasTrueFalseOutputs && (
        <Handle type="source" position={Position.Right} className="!bg-muted-foreground" />
      )}

      {meta.hasTrueFalseOutputs && (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            style={{ top: '35%' }}
            className="!bg-success"
          />
          <Handle
            type="source"
            position={Position.Right}
            id="false"
            style={{ top: '65%' }}
            className="!bg-destructive"
          />
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>true</span>
            <span>false</span>
          </div>
        </>
      )}
    </div>
  );
}

export const WorkflowNodeCard = memo(WorkflowNodeCardComponent);
