'use client';

import { cn } from '@/lib/utils';
import { NODE_TYPE_CATALOG } from '@/lib/workflow-node-types';
import type { WorkflowNode } from '@/lib/types';
import { Button } from '@/components/ui/button';

interface NodePaletteProps {
  onAddNode: (type: WorkflowNode['type']) => void;
  /** trigger/end are added exactly once automatically when a new workflow is
   * created (see workflow-editor.tsx) — offering them again in the palette would
   * just invite a confusing multi-trigger/multi-end graph the walker doesn't
   * support (see services/workflow-engine's README on single-path traversal). */
  disabledTypes?: WorkflowNode['type'][];
}

export function NodePalette({ onAddNode, disabledTypes = [] }: NodePaletteProps) {
  const addableTypes = NODE_TYPE_CATALOG.filter((n) => n.type !== 'trigger' && n.type !== 'end');

  return (
    <div className="flex h-full w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r p-3">
      <p className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Add a node
      </p>
      {addableTypes.map((meta) => {
        const Icon = meta.icon;
        const disabled = disabledTypes.includes(meta.type);
        return (
          <Button
            key={meta.type}
            variant="ghost"
            className="h-auto justify-start gap-2 px-2 py-2 text-left"
            disabled={disabled}
            onClick={() => onAddNode(meta.type)}
            title={meta.description}
          >
            <Icon className={cn('h-4 w-4 shrink-0', meta.colorClass.split(' ').slice(1).join(' '))} />
            <div className="min-w-0">
              <p className="truncate text-sm">{meta.label}</p>
            </div>
          </Button>
        );
      })}
    </div>
  );
}
