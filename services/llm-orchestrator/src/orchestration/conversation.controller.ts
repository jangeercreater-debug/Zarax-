import { Body, Controller, Param, Post } from '@nestjs/common';
import { CurrentPrincipal } from '@zarax/shared-auth';
import type { Principal } from '@zarax/shared-types';

import { ConversationTurnDto } from './dto/conversation-turn.dto';
import type { ConversationTurnResponseDto } from './dto/conversation-turn-response.dto';
import { ConversationOrchestratorService } from './conversation-orchestrator.service';

@Controller('conversations')
export class ConversationController {
  constructor(private readonly orchestrator: ConversationOrchestratorService) {}

  /**
   * Called once per user utterance (a finalized STT transcript). The response text
   * is what the caller (today: a test client; eventually: the voice pipeline worker
   * that also owns the LiveKit audio track) hands to tts-service for synthesis.
   * `shouldEndCall` tells that same caller whether to tear down the LiveKit room
   * after this turn's audio finishes playing.
   */
  @Post(':callId/turns')
  async submitTurn(
    @CurrentPrincipal() principal: Principal,
    @Param('callId') callId: string,
    @Body() dto: ConversationTurnDto,
  ): Promise<ConversationTurnResponseDto> {
    return this.orchestrator.handleTurn(principal.tenantId, callId, dto.agentId, dto.text);
  }
}
