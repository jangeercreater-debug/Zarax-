import { z } from 'zod';

import type { ToolDefinition } from '../registry/tool-definition.interface';

const API_URL = process.env.API_SERVICE_URL ?? 'http://localhost:3000';
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? '';

const CATEGORIES = [
  'name', 'family', 'friend', 'phone', 'address', 'birthday',
  'preference', 'goal', 'project', 'task', 'habit', 'favorite', 'note', 'fact',
] as const;

const paramsSchema = z.object({
  category: z.enum(CATEGORIES).describe('What kind of information this is.'),
  key: z.string().max(200).optional().describe('A short label, e.g. "mother\'s phone number" or "favorite food".'),
  value: z.string().max(2000).describe('The actual information to remember, in plain text.'),
  importance: z.number().min(1).max(5).optional().describe('1 (minor) to 5 (very important) — defaults to 3.'),
  expiresInDays: z.number().min(1).max(3650).optional().describe('Only set this for genuinely temporary things (e.g. "remind me tomorrow") — omit for permanent facts like names or birthdays.'),
});

/**
 * Lets Zarax actually persist things the caller asks her to remember (Phase 5 —
 * Persistent Memory Engine). Without this, the LLM can only say "I'll remember
 * that" without anything being stored — this tool is what makes it real.
 * Recall happens automatically and separately: llm-orchestrator's MemoryClient
 * fetches relevant memories before every turn, so there is no matching "recall"
 * tool for the LLM to call.
 */
export const rememberMemoryTool: ToolDefinition<z.infer<typeof paramsSchema>> = {
  name: 'remember_memory',
  description:
    'Saves a piece of information the caller wants you to remember for future conversations — ' +
    'names, family/friend details, phone numbers, addresses, birthdays, preferences, goals, ' +
    'projects, tasks, habits, or favorite things. Call this whenever the user says something like ' +
    '"remember that..." or shares information clearly meant to be recalled later.',
  parameters: paramsSchema,
  jsonSchema: {
    type: 'object',
    properties: {
      category: { type: 'string', enum: [...CATEGORIES], description: 'What kind of information this is.' },
      key: { type: 'string', description: 'A short label, e.g. "mother\'s phone number".' },
      value: { type: 'string', description: 'The actual information to remember.' },
      importance: { type: 'number', description: '1 (minor) to 5 (very important), defaults to 3.' },
      expiresInDays: { type: 'number', description: 'Only for temporary reminders — omit for permanent facts.' },
    },
    required: ['category', 'value'],
  },
  async handler(args, context) {
    try {
      const res = await fetch(API_URL + '/v1/internal/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Token': INTERNAL_TOKEN },
        body: JSON.stringify({
          tenantId: context.tenantId,
          userId: '',
          category: args.category,
          key: args.key ?? null,
          value: args.value,
          callId: context.callId,
          importance: args.importance ?? 3,
          expiresInDays: args.expiresInDays,
        }),
        signal: AbortSignal.timeout(8000),
      });
      return { remembered: res.ok };
    } catch (error) {
      return { remembered: false, error: error instanceof Error ? error.message : 'Failed to save memory' };
    }
  },
};
