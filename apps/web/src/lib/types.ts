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
  systemPrompt?: string;
  provider?: 'anthropic' | 'groq' | 'openai' | 'gemini';
  fallbackProviders?: Array<'anthropic' | 'groq' | 'openai' | 'gemini'>;
  model?: string;
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

/** Mirrors the {error:{...}} shape every ZaraX backend service's GlobalExceptionFilter produces. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
  };
}
