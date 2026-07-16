import { describe, expect, it } from 'vitest';

import { encodeRoomName, parseRoomName } from '../room-name.util';

describe('room-name.util', () => {
  it('round-trips tenantId/agentId/callId through encode and parse', () => {
    const identity = {
      tenantId: 'a1b2c3d4-0000-0000-0000-000000000001',
      agentId: 'a1b2c3d4-0000-0000-0000-000000000002',
      callId: 'a1b2c3d4-0000-0000-0000-000000000003',
    };

    const roomName = encodeRoomName(identity);
    expect(roomName).toBe(`t_${identity.tenantId}_a_${identity.agentId}_c_${identity.callId}`);

    const parsed = parseRoomName(roomName);
    expect(parsed).toEqual(identity);
  });

  it('throws a ValidationError for a malformed room name', () => {
    expect(() => parseRoomName('not-a-valid-room-name')).toThrow(
      /does not match the expected ZaraX format/,
    );
  });

  it('throws for a room name missing a required segment', () => {
    expect(() => parseRoomName('t_tenant-1_a_agent-1')).toThrow();
  });
});
