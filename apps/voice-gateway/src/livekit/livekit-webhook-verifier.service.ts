import { Injectable } from '@nestjs/common';
import { UnauthenticatedError } from '@zarax/shared-errors';
import { WebhookReceiver, type WebhookEvent } from 'livekit-server-sdk';

@Injectable()
export class LiveKitWebhookVerifier {
  private readonly receiver: WebhookReceiver;

  constructor(apiKey: string, apiSecret: string) {
    this.receiver = new WebhookReceiver(apiKey, apiSecret);
  }

  /** `rawBody` MUST be the exact, unparsed request body — signature verification
   * fails silently-wrong if it's re-serialized JSON instead of the original bytes. */
  async verifyAndParse(rawBody: string, authorizationHeader: string | undefined): Promise<WebhookEvent> {
    if (!authorizationHeader) {
      throw new UnauthenticatedError('Missing LiveKit webhook signature header.');
    }
    try {
      return await this.receiver.receive(rawBody, authorizationHeader);
    } catch (error) {
      throw new UnauthenticatedError(
        `LiveKit webhook signature verification failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
