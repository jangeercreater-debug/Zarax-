import { describe, expect, it } from 'vitest';

import { getCurrentDatetimeTool } from '../handlers/get-current-datetime.tool';
import { ToolRegistryService } from '../registry/tool-registry.service';
import { ToolsController } from '../tools.controller';

describe('ToolsController', () => {
  it('returns the registered tools in LLM-facing (JSON schema) shape', () => {
    const registry = new ToolRegistryService();
    registry.register(getCurrentDatetimeTool);

    const controller = new ToolsController(registry);
    const result = controller.list();

    expect(result).toEqual([
      {
        name: 'get_current_datetime',
        description: getCurrentDatetimeTool.description,
        parameters: getCurrentDatetimeTool.jsonSchema,
      },
    ]);
  });
});
