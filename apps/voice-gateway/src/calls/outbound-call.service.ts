import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfigService } from '@zarax/shared-config';
import { ValidationError } from '@zarax/shared-errors';
import { ZARAX_LOGGER, type ZaraxLogger } from '@zarax/shared-logger';
import { AgentRepository, PRISMA_CLIENT, type PrismaClient } from '@zarax/database';
import type { TenantId } from '@zarax/shared-types';
import { SipClient } from 'livekit-server-sdk';
import { v4 as uuidv4 } from 'uuid';

import type { VoiceGatewayEnv } from '../config/env.schema';
import { CallSessionService } from '../calls/call-session.service';
import { LiveKitRoomService } from '../livekit/livekit-room.service';
import { encodeRoomName } from '../rooms/room-name.util';

export interface OutboundCallResult {
  callId: string;
  roomName: string;
  sipParticipantIdentity: string;
}

@Injectable()
export class OutboundCallService {
  private readonly sipClient: SipClient;
  private readonly agentRepository: AgentRepository;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfigService<VoiceGatewayEnv>,
    private readonly liveKitRoomService: LiveKitRoomService,
    private readonly callSessionService: CallSessionService,
    @Inject(PRISMA_CLIENT) prisma: PrismaClient,
    @Inject(ZARAX_LOGGER) private readonly logger: ZaraxLogger,
  ) {
    this.sipClient = new SipClient(
      this.config.get('LIVEKIT_URL'),
      this.config.get('LIVEKIT_API_KEY'),
      this.config.get('LIVEKIT_API_SECRET'),
    );
    this.agentRepository = new AgentRepository(prisma);
  }

  async dial(tenantId: TenantId, params: { agentId: string; toNumber: string; fromNumber?: string }): Promise<OutboundCallResult> {
    const sipTrunkId = this.config.get('LIVEKIT_SIP_TRUNK_ID');
    if (!sipTrunkId) {
      throw new ValidationError('LIVEKIT_SIP_TRUNK_ID is not configured — outbound calls require a SIP trunk.');
    }

    await this.agentRepository.assertPublishedForTenant(tenantId, params.agentId);

    const callId = uuidv4();
    const roomName = encodeRoomName({ tenantId, agentId: params.agentId, callId });
    const sipIdentity = `phone-${callId}`;

    await this.liveKitRoomService.ensureRoom(roomName);
    await this.callSessionService.registerPendingCall(tenantId, roomName, params.agentId, callId);

    await this.sipClient.createSipParticipant(sipTrunkId, params.toNumber, roomName, {
      participantIdentity: sipIdentity,
      participantName: params.fromNumber ?? 'ZaraX Agent',
    });

    this.logger.log('OutboundCallService: dialed out', { callId, toNumber: params.toNumber, roomName });

    return { callId, roomName, sipParticipantIdentity: sipIdentity };
  }
}
