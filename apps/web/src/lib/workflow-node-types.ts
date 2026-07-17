import {
  Bot,
  Clock,
  GitBranch,
  Globe,
  Library,
  Mail,
  MonitorPlay,
  Webhook,
  type LucideIcon,
} from 'lucide-react';

import type { WorkflowNode } from './types';

export interface NodeTypeMeta {
  type: WorkflowNode['type'];
  label: string;
  description: string;
  icon: LucideIcon;
  /** Tailwind color token used for the node's accent border/icon — kept to a small,
   * deliberate palette rather than one color per node so the canvas doesn't look
   * like a rainbow (trigger/end are structurally special, everything else shares a
   * neutral "action" accent). */
  colorClass: string;
  hasTrueFalseOutputs?: boolean;
}

export const NODE_TYPE_CATALOG: NodeTypeMeta[] = [
  { type: 'trigger', label: 'Trigger', description: 'Where the workflow starts.', icon: MonitorPlay, colorClass: 'border-primary text-primary' },
  { type: 'ai_agent', label: 'AI Agent', description: 'Send a message through one of your agents.', icon: Bot, colorClass: 'border-blue-500 text-blue-600 dark:text-blue-400' },
  { type: 'knowledge_base', label: 'Knowledge Base', description: 'Search your knowledge base.', icon: Library, colorClass: 'border-blue-500 text-blue-600 dark:text-blue-400' },
  { type: 'condition', label: 'Condition', description: 'Branch based on a comparison.', icon: GitBranch, colorClass: 'border-amber-500 text-amber-600 dark:text-amber-400', hasTrueFalseOutputs: true },
  { type: 'delay', label: 'Delay', description: 'Wait before continuing.', icon: Clock, colorClass: 'border-amber-500 text-amber-600 dark:text-amber-400' },
  { type: 'webhook', label: 'Webhook', description: 'Send a notification to a URL.', icon: Webhook, colorClass: 'border-blue-500 text-blue-600 dark:text-blue-400' },
  { type: 'http_request', label: 'HTTP Request', description: 'Call any HTTP endpoint.', icon: Globe, colorClass: 'border-blue-500 text-blue-600 dark:text-blue-400' },
  { type: 'email', label: 'Email', description: 'Send an email. (Coming soon — not yet wired to a provider.)', icon: Mail, colorClass: 'border-muted-foreground/50 text-muted-foreground' },
  { type: 'end', label: 'End', description: 'Where the workflow finishes.', icon: MonitorPlay, colorClass: 'border-foreground text-foreground' },
];

export function getNodeTypeMeta(type: WorkflowNode['type']): NodeTypeMeta {
  return NODE_TYPE_CATALOG.find((n) => n.type === type) ?? NODE_TYPE_CATALOG[1];
}
