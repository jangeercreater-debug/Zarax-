import { Injectable } from '@nestjs/common';
import { ExternalServiceError } from '@zarax/shared-errors';
import { RoomServiceClient, type Room } from 'livekit-server-sdk';

const DEFAULT_EMPTY_TIMEOUT_SECONDS = 5 * 60; // auto-close an empty room after 5 minutes
const DEFAULT_MAX_PARTICIPANTS = 10; // caller + voice agent bot + safety margin

@Injectable()
export class LiveKitRoomService {
  private readonly client: RoomServiceClient;

  constructor(livekitUrl: string, apiKey: string, apiSecret: string) {
    this.client = new RoomServiceClient(livekitUrl, apiKey, apiSecret);
  }

  async ensureRoom(roomName: string): Promise<void> {
    try {
      await this.client.createRoom({
        name: roomName,
        emptyTimeout: DEFAULT_EMPTY_TIMEOUT_SECONDS,
        maxParticipants: DEFAULT_MAX_PARTICIPANTS,
      });
    } catch (error) {
      throw new ExternalServiceError(
        'LiveKit',
        error instanceof Error ? error.message : 'Failed to create room',
      );
    }
  }

  async deleteRoom(roomName: string): Promise<void> {
    try {
      await this.client.deleteRoom(roomName);
    } catch (error) {
      throw new ExternalServiceError(
        'LiveKit',
        error instanceof Error ? error.message : 'Failed to delete room',
      );
    }
  }

  async listActiveRooms(): Promise<string[]> {
    try {
      const rooms = await this.client.listRooms();
      return rooms.map((room: Room) => room.name);
    } catch (error) {
      throw new ExternalServiceError(
        'LiveKit',
        error instanceof Error ? error.message : 'Failed to list rooms',
      );
    }
  }
}
