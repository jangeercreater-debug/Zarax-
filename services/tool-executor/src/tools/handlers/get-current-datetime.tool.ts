import { z } from 'zod';

import type { ToolDefinition } from '../registry/tool-definition.interface';

const paramsSchema = z.object({
  timezone: z
    .string()
    .optional()
    .describe('IANA timezone name, e.g. "America/New_York". Defaults to UTC.'),
});

export const getCurrentDatetimeTool: ToolDefinition<z.infer<typeof paramsSchema>> = {
  name: 'get_current_datetime',
  description: "Returns the current date and time, optionally in the caller's timezone.",
  parameters: paramsSchema,
  jsonSchema: {
    type: 'object',
    properties: {
      timezone: { type: 'string', description: 'IANA timezone name, e.g. America/New_York' },
    },
  },
  async handler(args) {
    const now = new Date();
    const formatted = args.timezone
      ? new Intl.DateTimeFormat('en-US', {
          dateStyle: 'full',
          timeStyle: 'long',
          timeZone: args.timezone,
        }).format(now)
      : now.toISOString();

    return { iso: now.toISOString(), formatted, timezone: args.timezone ?? 'UTC' };
  },
};
