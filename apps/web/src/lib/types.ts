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

/** Mirrors the {error:{...}} shape every ZaraX backend service's GlobalExceptionFilter produces. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
  };
}
