import { Inject, Injectable } from '@nestjs/common';
import { CacheService, REDIS_CACHE } from '@zarax/redis-client';
import { NotFoundError } from '@zarax/shared-errors';
import { asTenantId, type TenantId } from '@zarax/shared-types';
import { createEvent, EVENT_BUS, type EventBus } from '@zarax/event-bus';

import { parseRoomName } from '../rooms/room-name.util';

const PENDING_CALL_TTL_SECONDS = 60 * 60; // a minted token that's never used to join expires after 1h
const PENDING_CALL_KEY_PREFIX = 'call-session:';

interface PendingCallMetadata {
  agentId: string;
  callId: string;
  channel: 'voice';
  registeredAt: string;
  startedAt?: string;
}

@Injectable()
export class CallSessionService {
  constructor(
    @Inject(REDIS_CACHE) private readonly cache: CacheService,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
  ) {}

  /** Called at token-mint time, before the participant has actually joined. */
  async registerPendingCall(
    tenantId: TenantId,
    roomName: string,
    agentId: string,
    callId: string,
  ): Promise<void> {
    const metadata: PendingCallMetadata = {
      agentId,
      callId,
      channel: 'voice',
      registeredAt: new Date().toISOString(),
    };
    await this.cache.set(tenantId, PENDING_CALL_KEY_PREFIX + roomName, metadata, PENDING_CALL_TTL_SECONDS);
  }

  /** Called from the LiveKit webhook when `room_started` fires (first participant joined). */
  async handleRoomStarted(roomName: string): Promise<void> {
    const { tenantId } = parseRoomName(roomName);
    const tenant = asTenantId(tenantId);
    const metadata = await this.cache.get<PendingCallMetadata>(tenant, PENDING_CALL_KEY_PREFIX + roomName);
    if (!metadata) {
      throw new NotFoundError('Pending call session', roomName);
    }

    const startedAt = new Date().toISOString();
    await this.cache.set(
      tenant,
      PENDING_CALL_KEY_PREFIX + roomName,
      { ...metadata, startedAt },
      PENDING_CALL_TTL_SECONDS,
    );

    const event = createEvent({
      type: 'call.started',
      tenantId: tenant,
      payload: {
        callId: metadata.callId,
        agentId: metadata.agentId,
        channel: metadata.channel,
        startedAt,
      },
    });
    await this.eventBus.publish(event);
  }

  /** Called from the LiveKit webhook when `room_finished` fires (last participant left). */
  async handleRoomFinished(
    roomName: string,
    endReason: 'completed' | 'caller_hangup' | 'agent_error' | 'timeout' = 'completed',
  ): Promise<void> {
    const { tenantId } = parseRoomName(roomName);
    const tenant = asTenantId(tenantId);
    const metadata = await this.cache.get<PendingCallMetadata>(tenant, PENDING_CALL_KEY_PREFIX + roomName);
    if (!metadata) {
      // The room may have closed without ever receiving a participant (e.g. a minted
      // token that was never used) — nothing to report, not an error condition.
      return;
    }

    const startedAtMs = metadata.startedAt ? new Date(metadata.startedAt).getTime() : Date.now();
    const durationMs = Date.now() - startedAtMs;

    const event = createEvent({
      type: 'call.ended',
      tenantId: tenant,
      payload: {
        callId: metadata.callId,
        agentId: metadata.agentId,
        durationMs,
        endReason,
      },
    });
    await this.eventBus.publish(event);
    await this.cache.delete(tenant, PENDING_CALL_KEY_PREFIX + roomName);
  }
}
