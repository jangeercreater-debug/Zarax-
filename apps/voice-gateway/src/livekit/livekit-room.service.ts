import { Injectable } from '@nestjs/common';
import { ExternalServiceError } from '@zarax/shared-errors';
import type { ZaraxLogger } from '@zarax/shared-logger';
import { ResilientClient } from '@zarax/resilience';
import { RoomServiceClient, type Room } from 'livekit-server-sdk';

const DEFAULT_EMPTY_TIMEOUT_SECONDS = 5 * 60; // auto-close an empty room after 5 minutes
const DEFAULT_MAX_PARTICIPANTS = 10; // caller + voice agent bot + safety margin

/**
 * Wraps a raw LiveKit SDK call so genuine SDK-level failures surface as
 * ExternalServiceError — while errors thrown by the resilience layer itself
 * (TimeoutError, CircuitOpenError, RateLimitedError) are already properly typed
 * AppErrors and must NOT be caught/rewrapped here, or callers lose the ability to
 * distinguish "LiveKit itself failed" from "we deliberately didn't call LiveKit".
 */
async function callLiveKit<T>(operationName: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw new ExternalServiceError(
      'LiveKit',
      error instanceof Error ? error.message : `${operationName} failed`,
    );
  }
}

@Injectable()
export class LiveKitRoomService {
  private readonly client: RoomServiceClient;
  public readonly resilientClient: ResilientClient;

  constructor(livekitUrl: string, apiKey: string, apiSecret: string, logger?: ZaraxLogger) {
    this.client = new RoomServiceClient(livekitUrl, apiKey, apiSecret);
    // All outbound LiveKit REST calls go through this single ResilientClient — retry
    // with backoff for transient network blips, a short timeout so a slow LiveKit
    // response never hangs a call-setup request, and a circuit breaker so a LiveKit
    // outage fails fast instead of queuing up retries against a dead endpoint.
    this.resilientClient = new ResilientClient({
      providerName: 'livekit',
      timeoutMs: 5000,
      retry: { maxAttempts: 3, baseDelayMs: 200, maxDelayMs: 2000 },
      circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30_000 },
      logger,
    });
  }

  async ensureRoom(roomName: string): Promise<void> {
    await this.resilientClient.execute(
      () =>
        callLiveKit('createRoom', () =>
          this.client.createRoom({
            name: roomName,
            emptyTimeout: DEFAULT_EMPTY_TIMEOUT_SECONDS,
            maxParticipants: DEFAULT_MAX_PARTICIPANTS,
          }),
        ),
      'LiveKit.createRoom',
    );
  }

  async deleteRoom(roomName: string): Promise<void> {
    await this.resilientClient.execute(
      () => callLiveKit('deleteRoom', () => this.client.deleteRoom(roomName)),
      'LiveKit.deleteRoom',
    );
  }

  async listActiveRooms(): Promise<string[]> {
    const rooms = await this.resilientClient.execute(
      () => callLiveKit('listRooms', () => this.client.listRooms()),
      'LiveKit.listRooms',
    );
    return rooms.map((room: Room) => room.name);
  }
}
