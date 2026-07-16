import { Injectable } from '@nestjs/common';
import { NotFoundError } from '@zarax/shared-errors';

import type { AnyToolDefinition } from './tool-definition.interface';

@Injectable()
export class ToolRegistryService {
  private readonly tools = new Map<string, AnyToolDefinition>();

  register(tool: AnyToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): AnyToolDefinition {
    const tool = this.tools.get(name);
    if (!tool) throw new NotFoundError('Tool', name);
    return tool;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): AnyToolDefinition[] {
    return [...this.tools.values()];
  }

  /** JSON-schema tool definitions in the shape llm-orchestrator hands to
   * @zarax/ai-sdk's CompletionRequest.tools — one place tool metadata is exposed to
   * callers, so llm-orchestrator never needs its own copy of what each tool expects. */
  listForLLM(): Array<{ name: string; description: string; parameters: AnyToolDefinition['jsonSchema'] }> {
    return this.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.jsonSchema,
    }));
  }
}
