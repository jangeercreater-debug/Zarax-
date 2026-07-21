import { ValidationError } from '@zarax/shared-errors';

const ROOM_NAME_PATTERN = /^t_(?<tenantId>[^_]+)_a_(?<agentId>[^_]+)_c_(?<callId>[^_]+)$/;

export interface RoomIdentity {
  tenantId: string;
  agentId: string;
  callId: string;
}

/** UUIDs never contain underscores, so `_` is a safe, unambiguous separator here. */
export function encodeRoomName(identity: RoomIdentity): string {
  return `t_${identity.tenantId}_a_${identity.agentId}_c_${identity.callId}`;
}

export function parseRoomName(roomName: string): RoomIdentity {
  const match = ROOM_NAME_PATTERN.exec(roomName);
  if (!match?.groups) {
    throw new ValidationError(`Room name '${roomName}' does not match the expected ZaraX format.`);
  }
  const { tenantId, agentId, callId } = match.groups as {
    tenantId: string;
    agentId: string;
    callId: string;
  };
  return { tenantId, agentId, callId };
}
