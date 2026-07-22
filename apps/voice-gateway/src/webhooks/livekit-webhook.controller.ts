import { BadRequestException, Controller, Headers, HttpCode, HttpStatus, Post, Req, type RawBodyRequest } from '@nestjs/common';
import { Public } from '@zarax/shared-auth';
import type { Request } from 'express';

import { CallSessionService } from '../calls/call-session.service';
import { LiveKitWebhookVerifier } from '../livekit/livekit-webhook-verifier.service';

@Public()
@Controller('webhooks/livekit')
export class LiveKitWebhookController {
  constructor(
    private readonly verifier: LiveKitWebhookVerifier,
    private readonly callSessionService: CallSessionService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('authorization') authHeader?: string,
  ): Promise<{ received: true }> {
    // Signature verification requires the exact original bytes — main.ts enables
    // `rawBody: true` specifically so req.rawBody is populated here.
    const rawBody = req.rawBody?.toString('utf8') ?? '';
    // TEMPORARY DIAGNOSTIC -- surfaces why signature verification fails.
    if (process.env.LIVEKIT_WEBHOOK_DEBUG === 'true') {
      throw new BadRequestException(
        `WEBHOOK_DEBUG contentType=${req.headers['content-type'] ?? 'NONE'} ` +
          `rawBodyPresent=${req.rawBody !== undefined} rawBodyLen=${rawBody.length} ` +
          `authHeaderPresent=${authHeader !== undefined} bodyPreview=${rawBody.slice(0, 80)}`,
      );
    }
    const event = await this.verifier.verifyAndParse(rawBody, authHeader);

    switch (event.event) {
      case 'room_started':
        if (event.room?.name) await this.callSessionService.handleRoomStarted(event.room.name);
        break;
      case 'room_finished':
        if (event.room?.name) await this.callSessionService.handleRoomFinished(event.room.name);
        break;
      default:
        // participant_joined, track_published, etc. — not needed by voice-gateway yet.
        break;
    }

    return { received: true };
  }
}
