import { describe, expect, it } from 'vitest';

import { getCurrentDatetimeTool } from '../get-current-datetime.tool';

describe('getCurrentDatetimeTool', () => {
  it('returns an ISO timestamp defaulting to UTC when no timezone is given', async () => {
    const result = await getCurrentDatetimeTool.handler(
      {},
      { tenantId: 't1', callId: 'c1', agentConfig: {} },
    );
    expect(result.timezone).toBe('UTC');
    expect(typeof result.iso).toBe('string');
    expect(new Date(result.iso as string).toString()).not.toBe('Invalid Date');
  });

  it('formats the time in the requested timezone', async () => {
    const result = await getCurrentDatetimeTool.handler(
      { timezone: 'America/New_York' },
      { tenantId: 't1', callId: 'c1', agentConfig: {} },
    );
    expect(result.timezone).toBe('America/New_York');
    expect(typeof result.formatted).toBe('string');
  });

  it('validates arguments via its zod schema', () => {
    const parsed = getCurrentDatetimeTool.parameters.safeParse({ timezone: 123 });
    expect(parsed.success).toBe(false);
  });
});
