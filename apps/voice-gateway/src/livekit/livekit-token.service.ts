import { Injectable } from '@nestjs/common';
import { ExternalServiceError } from '@zarax/shared-errors';
import type { ZaraxLogger } from '@zarax/shared-logger';
import { ResilientClient } from '@zarax/resilience';
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
  private readonly resilientClient: ResilientClient;

  constructor(
    private readonly apiKey: string,
    private readonly apiSecret: string,
    logger?: ZaraxLogger,
  ) {
    // Token minting is local JWT signing (no network call), but wrapped the same way
    // as every other provider adapter for consistency and so a future change to how
    // tokens are minted (e.g. a LiveKit API call instead of local signing) doesn't
    // require touching call sites.
    this.resilientClient = new ResilientClient({
      providerName: 'livekit-token',
      timeoutMs: 2000,
      retry: { maxAttempts: 2, baseDelayMs: 100 },
      circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 15_000 },
      logger,
    });
  }

  async mint(params: MintTokenParams): Promise<string> {
    return this.resilientClient.execute(async () => {
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
    }, 'LiveKit.mintToken');
  }
}
