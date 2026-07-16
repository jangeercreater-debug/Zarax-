import type { z, ZodSchema } from 'zod';

export interface ToolExecutionContext {
  tenantId: string;
  callId: string;
  /** Arbitrary per-tenant tool configuration (e.g. a webhook URL) — sourced from the
   * calling Agent's `config` JSON column, kept generic here since each tool defines
   * its own expected shape within it. */
  agentConfig: Record<string, unknown>;
}

export interface ToolDefinition<TArgs = unknown> {
  name: string;
  description: string;
  /** Validates and types the raw arguments the LLM produced — untrusted input until
   * this passes. Also the source of truth for the JSON schema handed to the LLM's
   * function-calling API (see toJsonSchema below). */
  parameters: ZodSchema<TArgs>;
  /** JSON-schema shape for the LLM's tool-use API (ai-sdk's ToolDefinition.parameters) —
   * kept separate from the zod schema since JSON Schema and zod aren't the same
   * format; each tool declares both, and a mismatch between them is a bug the tool's
   * own tests should catch. */
  jsonSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (args: TArgs, context: ToolExecutionContext) => Promise<Record<string, unknown>>;
}

export type AnyToolDefinition = ToolDefinition<z.infer<ZodSchema>>;
