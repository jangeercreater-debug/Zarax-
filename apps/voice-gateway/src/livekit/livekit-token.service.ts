import { Injectable } from '@nestjs/common';
import { ExternalServiceError } from '@zarax/shared-errors';
import { AccessToken } from 'livekit-server-sdk';

export interface MintTokenParams {
  roomName: string;
  /** Unique per-participant identity within the room — e.g. `caller` or `agent-bot`. */
  identity: string;
  canPublish?: boolean;
  canSubscribe?: boolean;
  ttlSeconds?: number;
}

@Injectable()
export class LiveKitTokenService {
  constructor(
    private readonly apiKey: string,
    private readonly apiSecret: string,
  ) {}

  async mint(params: MintTokenParams): Promise<string> {
    try {
      const token = new AccessToken(this.apiKey, this.apiSecret, {
        identity: params.identity,
        ttl: params.ttlSeconds ?? 3600,
      });

      token.addGrant({
        roomJoin: true,
        room: params.roomName,
        canPublish: params.canPublish ?? true,
        canSubscribe: params.canSubscribe ?? true,
      });

      return await token.toJwt();
    } catch (error) {
      throw new ExternalServiceError(
        'LiveKit',
        error instanceof Error ? error.message : 'Failed to mint access token',
      );
    }
  }
}
