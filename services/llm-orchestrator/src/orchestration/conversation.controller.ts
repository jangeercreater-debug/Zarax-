import { Body, Controller, Param, Post } from '@nestjs/common';
import { CurrentPrincipal, resolveEffectiveTenantId } from '@zarax/shared-auth';
import type { Principal } from '@zarax/shared-types';

import { ConversationTurnDto } from './dto/conversation-turn.dto';
import type { ConversationTurnResponseDto } from './dto/conversation-turn-response.dto';
import { ConversationOrchestratorService } from './conversation-orchestrator.service';
import { IntelligenceContextService } from './intelligence-context.service';

@Controller('conversations')
export class ConversationController {
  constructor(
    private readonly orchestrator: ConversationOrchestratorService,
    private readonly intelligenceContext: IntelligenceContextService,
  ) {}

  /**
   * Called once per user utterance (a finalized STT transcript), or by "Test Agent"
   * (services/api) / the AI Agent workflow node (workflow-engine) as a dry run. The
   * response text is what the caller (today: a test client; eventually: the voice
   * pipeline worker that also owns the LiveKit audio track) hands to tts-service for
   * synthesis. `shouldEndCall` tells that same caller whether to tear down the
   * LiveKit room after this turn's audio finishes playing.
   *
   * For a service_account caller (Test Agent, workflow nodes), `dto.tenantId` is
   * required and used instead of the service account's own bound tenant — see
   * resolveEffectiveTenantId's doc comment for why.
   */
  @Post(':callId/turns')
  async submitTurn(
    @CurrentPrincipal() principal: Principal,
    @Param('callId') callId: string,
    @Body() dto: ConversationTurnDto,
  ): Promise<ConversationTurnResponseDto> {
    const tenantId = resolveEffectiveTenantId(principal, dto.tenantId);
    return this.orchestrator.handleTurn(tenantId, callId, dto.agentId, dto.text);
  }

  /**
   * Called by voice-runtime's GPT-Realtime path before each response.create —
   * returns a compact intelligence context prompt (emotion, pacing, memory recall,
   * conversation hints) without making any LLM call, targeting <200 ms so it does
   * not materially affect the user-perceived first-response latency.
   * The voice-session injects the returned contextPrompt as a system
   * conversation_item into the live Realtime session, then fires response.create.
   * This makes Phases 3–6 intelligence (personality, emotion, memory, conversation
   * continuity) work on every Realtime turn — not just at session start.
   */
  @Post(':callId/intelligence-context')
  async getIntelligenceContext(
    @CurrentPrincipal() principal: Principal,
    @Param('callId') callId: string,
    @Body() dto: ConversationTurnDto,
  ): Promise<{ contextPrompt: string; shouldInject: boolean }> {
    const tenantId = resolveEffectiveTenantId(principal, dto.tenantId);
    return this.intelligenceContext.buildContext(tenantId, callId, dto.agentId, dto.text);
  }
}
