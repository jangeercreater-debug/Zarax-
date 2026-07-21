import { Inject, Injectable } from '@nestjs/common';
import { AgentRepository } from '@zarax/database';
import { APP_CONFIG, type AppConfigService } from '@zarax/shared-config';
import type { TenantId } from '@zarax/shared-types';
import { v4 as uuidv4 } from 'uuid';

import type { VoiceGatewayEnv } from '../config/env.schema';
import { CallSessionService } from '../calls/call-session.service';
import { LiveKitRoomService } from '../livekit/livekit-room.service';
import { LiveKitTokenService } from '../livekit/livekit-token.service';
import type { CreateRoomDto } from './dto/create-room.dto';
import type { RoomTokenResponseDto } from './dto/room-token-response.dto';
import { encodeRoomName } from './room-name.util';

@Injectable()
export class RoomsService {
  constructor(
    @Inject(AgentRepository) private readonly agentRepository: AgentRepository,
    @Inject(LiveKitRoomService) private readonly liveKitRoomService: LiveKitRoomService,
    @Inject(LiveKitTokenService) private readonly liveKitTokenService: LiveKitTokenService,
    @Inject(CallSessionService) private readonly callSessionService: CallSessionService,
    @Inject(APP_CONFIG) private readonly config: AppConfigService<VoiceGatewayEnv>,
  ) {}

  async createRoomAndToken(
    tenantId: TenantId,
    dto: CreateRoomDto,
  ): Promise<RoomTokenResponseDto> {
    // Confirms the agent exists, belongs to this tenant, and is published (isActive) —
    // the tenant-scoping is enforced by AgentRepository (extends
    // TenantScopedRepository), not by a filter this method could forget to apply. A
    // draft agent is a normal, valid agent everywhere else (dashboard, test calls) —
    // this is specifically the one place "must be live" is enforced, since it's the
    // entry point a real caller reaches.
    await this.agentRepository.assertPublishedForTenant(tenantId, dto.agentId);

    const callId = uuidv4();
    const roomName = encodeRoomName({ tenantId, agentId: dto.agentId, callId });

    await this.liveKitRoomService.ensureRoom(roomName);
    await this.callSessionService.registerPendingCall(tenantId, roomName, dto.agentId, callId);

    const token = await this.liveKitTokenService.mint({
      roomName,
      identity: dto.participantIdentity ?? `caller-${callId}`,
    });

    return { callId, roomName, livekitUrl: this.config.get('LIVEKIT_URL'), token };
  }
}
