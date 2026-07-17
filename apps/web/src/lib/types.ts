/** Mirrors services/api's AuthTokensDto. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** Mirrors services/api's TenantResponseDto. */
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
}

/** Mirrors services/llm-orchestrator's AgentRuntimeConfig / services/api's AgentConfigDto. */
export interface AgentConfig {
  description?: string;
  systemPrompt?: string;
  welcomeMessage?: string;
  provider?: 'anthropic' | 'groq' | 'openai' | 'gemini';
  fallbackProviders?: Array<'anthropic' | 'groq' | 'openai' | 'gemini'>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseStyle?: 'concise' | 'balanced' | 'detailed';
  interruptSensitivity?: 'low' | 'medium' | 'high';
  voiceId?: string;
  sttModel?: string;
  enabledTools?: string[];
  ragEnabled?: boolean;
  maxToolIterations?: number;
  webhooks?: Record<string, string>;
}

/** Mirrors services/api's AgentResponseDto. */
export interface Agent {
  id: string;
  name: string;
  isActive: boolean;
  config: AgentConfig;
  currentVersion: number;
}

/** Mirrors services/api's AgentVersionResponseDto. */
export interface AgentVersion {
  id: string;
  version: number;
  config: AgentConfig;
  createdBy: string | null;
  createdAt: string;
}

/** Mirrors services/api's ProfileResponseDto. */
export interface Profile {
  id: string;
  email: string;
  fullName: string | null;
  emailVerified: boolean;
}

/** Mirrors services/api's MembershipResponseDto. */
export interface Membership {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: string;
}

/** Mirrors services/api's SessionResponseDto. */
export interface Session {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string;
  isCurrent: boolean;
}

/** Mirrors services/rag-service's DocumentResponseDto. */
export interface KnowledgeBaseDocument {
  id: string;
  name: string;
  sourceType: 'pdf' | 'docx' | 'txt' | 'url';
  sourceUrl: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  chunkCount: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Mirrors services/rag-service's SearchResultDto. */
export interface KnowledgeBaseSearchResult {
  text: string;
  score: number;
  metadata: Record<string, unknown>;
}

/** Mirrors services/api's ToolCatalogEntry (proxied from tool-executor). */
export interface ToolCatalogEntry {
  name: string;
  description: string;
}

/** Mirrors services/api's feature-flags endpoint response. */
export interface AgentFeatureFlag {
  key: string;
  label: string;
  enabled: boolean;
}

/** Mirrors services/api's WorkflowNodeDto. */
export interface WorkflowNode {
  id: string;
  type: 'trigger' | 'ai_agent' | 'knowledge_base' | 'condition' | 'delay' | 'webhook' | 'http_request' | 'email' | 'end';
  position: { x: number; y: number };
  data: Record<string, unknown>;
  label?: string;
}

/** Mirrors services/api's WorkflowEdgeDto. */
export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

/** Mirrors services/api's WorkflowResponseDto. */
export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  definition: WorkflowDefinition;
  currentVersion: number;
}

/** Mirrors services/api's WorkflowVersionResponseDto. */
export interface WorkflowVersion {
  id: string;
  version: number;
  definition: WorkflowDefinition;
  createdBy: string | null;
  createdAt: string;
}

/** Mirrors services/api's WorkflowExecutionResponseDto. */
export interface WorkflowExecution {
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

/** Mirrors the {error:{...}} shape every ZaraX backend service's GlobalExceptionFilter produces. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
  };
}
