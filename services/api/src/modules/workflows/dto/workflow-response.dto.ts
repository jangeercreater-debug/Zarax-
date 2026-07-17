export interface WorkflowResponseDto {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  definition: Record<string, unknown>;
  currentVersion: number;
}

export interface WorkflowVersionResponseDto {
  id: string;
  version: number;
  definition: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
}

export interface WorkflowExecutionResponseDto {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  triggerType: 'manual' | 'event';
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  errorMessage: string | null;
  nodeExecutions: Array<{
    nodeId: string;
    nodeType: string;
    status: 'completed' | 'failed' | 'skipped';
    input: unknown;
    output: unknown;
    errorMessage?: string;
    startedAt: string;
    completedAt: string;
  }>;
  startedAt: string;
  completedAt: string | null;
}
