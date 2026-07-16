import { describe, expect, it } from 'vitest';

import { endCallTool } from '../end-call.tool';

describe('endCallTool', () => {
  it('returns shouldEndCall: true with the given reason', async () => {
    const result = await endCallTool.handler(
      { reason: 'completed', summary: 'Resolved billing question.' },
      { tenantId: 't1', callId: 'c1', agentConfig: {} },
    );
    expect(result).toEqual({
      shouldEndCall: true,
      reason: 'completed',
      summary: 'Resolved billing question.',
    });
  });

  it('defaults summary to null when omitted', async () => {
    const result = await endCallTool.handler(
      { reason: 'caller_requested' },
      { tenantId: 't1', callId: 'c1', agentConfig: {} },
    );
    expect(result.summary).toBeNull();
  });

  it('rejects an invalid reason via its zod schema', () => {
    const parsed = endCallTool.parameters.safeParse({ reason: 'not_a_real_reason' });
    expect(parsed.success).toBe(false);
  });
});
