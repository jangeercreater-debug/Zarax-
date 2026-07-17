'use client';

import { X } from 'lucide-react';

import { useAgents } from '@/hooks/use-agents';
import { getNodeTypeMeta } from '@/lib/workflow-node-types';
import type { WorkflowNode } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const CONDITION_OPERATORS = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'greater_than', label: 'Greater than' },
  { value: 'less_than', label: 'Less than' },
  { value: 'is_empty', label: 'Is empty' },
  { value: 'is_not_empty', label: 'Is not empty' },
] as const;

interface NodePropertiesPanelProps {
  node: WorkflowNode;
  onChange: (nodeId: string, data: Record<string, unknown>) => void;
  onLabelChange: (nodeId: string, label: string) => void;
  onClose: () => void;
  onDelete: (nodeId: string) => void;
}

/** {{path}} template hint shown under fields that support referencing an earlier
 * node's output — see services/workflow-engine's template-resolver.ts, which this
 * mirrors on the authoring side. */
function TemplateHint() {
  return (
    <p className="text-xs text-muted-foreground">
      Reference an earlier node&rsquo;s output with <code className="rounded bg-muted px-1">{'{{nodeId.field}}'}</code>.
    </p>
  );
}

export function NodePropertiesPanel({ node, onChange, onLabelChange, onClose, onDelete }: NodePropertiesPanelProps) {
  const meta = getNodeTypeMeta(node.type);
  const { data: agents } = useAgents();

  function set(key: string, value: unknown) {
    onChange(node.id, { ...node.data, [key]: value });
  }

  return (
    <div className="flex h-full w-80 shrink-0 flex-col overflow-y-auto border-l p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{meta.label}</p>
          <p className="text-xs text-muted-foreground">{node.id}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Label</Label>
          <Input
            value={node.label ?? ''}
            onChange={(e) => onLabelChange(node.id, e.target.value)}
            placeholder={meta.label}
          />
        </div>

        {node.type === 'trigger' && (
          <div className="space-y-2">
            <Label>Trigger type</Label>
            <Select value={(node.data.eventType as string) ?? 'manual'} onValueChange={(v) => set('eventType', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual (Run now / Test Workflow)</SelectItem>
                <SelectItem value="call.ended" disabled>
                  On call ended (coming soon)
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Only manual triggering runs today — event-based auto-triggering isn&rsquo;t built yet.
            </p>
          </div>
        )}

        {node.type === 'ai_agent' && (
          <>
            <div className="space-y-2">
              <Label>Agent</Label>
              <Select value={(node.data.agentId as string) ?? ''} onValueChange={(v) => set('agentId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents?.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                value={(node.data.message as string) ?? ''}
                onChange={(e) => set('message', e.target.value)}
                placeholder="{{trigger.message}}"
                className="min-h-[80px]"
              />
              <TemplateHint />
            </div>
          </>
        )}

        {node.type === 'knowledge_base' && (
          <>
            <div className="space-y-2">
              <Label>Query</Label>
              <Textarea
                value={(node.data.query as string) ?? ''}
                onChange={(e) => set('query', e.target.value)}
                placeholder="{{trigger.message}}"
                className="min-h-[80px]"
              />
              <TemplateHint />
            </div>
            <div className="space-y-2">
              <Label>Result limit</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={(node.data.limit as number) ?? 5}
                onChange={(e) => set('limit', Number(e.target.value))}
              />
            </div>
          </>
        )}

        {node.type === 'condition' && (
          <>
            <div className="space-y-2">
              <Label>Field</Label>
              <Input
                value={(node.data.field as string) ?? ''}
                onChange={(e) => set('field', e.target.value)}
                placeholder="{{trigger.status}}"
              />
              <TemplateHint />
            </div>
            <div className="space-y-2">
              <Label>Operator</Label>
              <Select value={(node.data.operator as string) ?? 'equals'} onValueChange={(v) => set('operator', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONDITION_OPERATORS.map((op) => (
                    <SelectItem key={op.value} value={op.value}>
                      {op.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Value</Label>
              <Input value={(node.data.value as string) ?? ''} onChange={(e) => set('value', e.target.value)} />
            </div>
          </>
        )}

        {node.type === 'delay' && (
          <div className="space-y-2">
            <Label>Duration (seconds)</Label>
            <Input
              type="number"
              min={1}
              value={Math.round(((node.data.durationMs as number) ?? 60_000) / 1000)}
              onChange={(e) => set('durationMs', Number(e.target.value) * 1000)}
            />
            <p className="text-xs text-muted-foreground">Maximum 24 hours.</p>
          </div>
        )}

        {(node.type === 'webhook' || node.type === 'http_request') && (
          <>
            <div className="space-y-2">
              <Label>URL</Label>
              <Input
                value={(node.data.url as string) ?? ''}
                onChange={(e) => set('url', e.target.value)}
                placeholder="https://example.com/hook"
              />
              <TemplateHint />
            </div>
            {node.type === 'http_request' && (
              <div className="space-y-2">
                <Label>Method</Label>
                <Select value={(node.data.method as string) ?? 'GET'} onValueChange={(v) => set('method', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Body (JSON, optional)</Label>
              <Textarea
                value={typeof node.data.body === 'string' ? node.data.body : JSON.stringify(node.data.body ?? {}, null, 2)}
                onChange={(e) => {
                  try {
                    set('body', JSON.parse(e.target.value));
                  } catch {
                    set('body', e.target.value); // let them keep typing invalid JSON without losing it
                  }
                }}
                className="min-h-[100px] font-mono text-xs"
              />
            </div>
          </>
        )}

        {node.type === 'email' && (
          <>
            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              Coming soon — no email provider is integrated yet. This node&rsquo;s configuration is saved but
              won&rsquo;t send anything.
            </div>
            <div className="space-y-2">
              <Label>To</Label>
              <Input value={(node.data.to as string) ?? ''} onChange={(e) => set('to', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input value={(node.data.subject as string) ?? ''} onChange={(e) => set('subject', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Body</Label>
              <Textarea
                value={(node.data.body as string) ?? ''}
                onChange={(e) => set('body', e.target.value)}
                className="min-h-[100px]"
              />
            </div>
          </>
        )}

        {node.type === 'end' && (
          <div className="space-y-2">
            <Label>Output field (optional)</Label>
            <Input
              value={(node.data.outputField as string) ?? ''}
              onChange={(e) => set('outputField', e.target.value)}
              placeholder="e.g. node2 — leave blank to return everything"
            />
          </div>
        )}
      </div>

      <div className="mt-6 border-t pt-4">
        <Button variant="outline" size="sm" className="w-full text-destructive hover:text-destructive" onClick={() => onDelete(node.id)}>
          Delete node
        </Button>
      </div>
    </div>
  );
}
