import { z } from 'zod';

import type { ToolDefinition } from '../registry/tool-definition.interface';

const paramsSchema = z.object({
  reason: z
    .enum(['completed', 'caller_requested', 'unable_to_help'])
    .describe('Why the call should end.'),
  summary: z.string().max(500).optional().describe('A brief summary of the call outcome.'),
});

/**
 * Deliberately does NOT call voice-gateway or LiveKit directly — tool-executor
 * executes actions, it doesn't own call lifecycle decisions. It returns a structured
 * signal; llm-orchestrator (which does own the conversation state machine) reads
 * `shouldEndCall` from the tool result and is responsible for actually tearing down
 * the LiveKit room via voice-gateway.
 */
export const endCallTool: ToolDefinition<z.infer<typeof paramsSchema>> = {
  name: 'end_call',
  description:
    'Signals that the conversation should end. Use when the caller\'s request has been ' +
    'fully addressed, they ask to hang up, or you are unable to help further.',
  parameters: paramsSchema,
  jsonSchema: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        enum: ['completed', 'caller_requested', 'unable_to_help'],
        description: 'Why the call should end.',
      },
      summary: { type: 'string', description: 'A brief summary of the call outcome.' },
    },
    required: ['reason'],
  },
  async handler(args) {
    return { shouldEndCall: true, reason: args.reason, summary: args.summary ?? null };
  },
};
