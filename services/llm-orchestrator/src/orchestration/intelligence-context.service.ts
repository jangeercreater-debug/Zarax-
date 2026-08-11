import { Inject, Injectable } from '@nestjs/common';
import { AgentRepository, PRISMA_CLIENT, type PrismaClient } from '@zarax/database';
import type { TenantId } from '@zarax/shared-types';

import { MemoryClient } from '../memory-client/memory-client';
import { IntentDetector } from '../intelligence/intent-detector';
import { DecisionEngine } from '../intelligence/decision-engine';
import { ConversationIntelligence } from '../intelligence/conversation-intelligence';
import { EmotionDetector } from '../intelligence/emotion-detector';
import { EmotionalAdaptationEngine } from '../intelligence/emotional-adaptation';
import { resolveAgentRuntimeConfig } from './agent-runtime-config';

export interface IntelligenceContextResult {
  contextPrompt: string;
  shouldInject: boolean;
}

/**
 * Returns a compact per-turn intelligence prompt suitable for injection into a live
 * GPT-Realtime conversation_item (role: "system") before each response.create call.
 * Critically, this does NOT make any LLM call — it just runs our local detectors
 * and fetches memories, so the round-trip stays well under 200 ms in production.
 * The voice-session calls this after every speech_stopped event, injects the result
 * as a system message, then fires response.create — giving OpenAI Realtime all of
 * our Phases 3–6 intelligence on every turn, not just at session start.
 */
@Injectable()
export class IntelligenceContextService {
  private readonly agentRepository: AgentRepository;

  constructor(
    @Inject(PRISMA_CLIENT) prisma: PrismaClient,
    private readonly memoryClient: MemoryClient,
    private readonly intentDetector: IntentDetector,
    private readonly decisionEngine: DecisionEngine,
    private readonly conversationIntelligence: ConversationIntelligence,
    private readonly emotionDetector: EmotionDetector,
    private readonly emotionalAdaptation: EmotionalAdaptationEngine,
  ) {
    this.agentRepository = new AgentRepository(prisma);
  }

  async buildContext(
    tenantId: TenantId,
    callId: string,
    agentId: string,
    userText: string,
  ): Promise<IntelligenceContextResult> {
    const parts: string[] = [];

    // 1. Emotion detection + adaptation (local, ~0ms)
    const emotion = this.emotionDetector.detect(userText);
    const emotionPrompt = this.emotionalAdaptation.generatePrompt(emotion);
    if (emotionPrompt) parts.push(emotionPrompt);

    // 2. Intent + pacing (local, ~0ms)
    const intent = this.intentDetector.detect(userText);
    const decision = this.decisionEngine.decide(intent.intent);
    if (decision.reasoning.pacingHint) {
      parts.push(`[Pacing] ${decision.reasoning.pacingHint}`);
    }

    // 3. Conversation intelligence (local, ~0ms)
    const topicHint = this.conversationIntelligence.processUserTurn(callId, userText);
    if (topicHint) parts.push(topicHint);

    const antiRepeat = this.conversationIntelligence.getAntiRepetitionHint(callId);
    if (antiRepeat) parts.push(antiRepeat);

    const followUp = this.conversationIntelligence.getFollowUpHint(callId);
    if (followUp) parts.push(followUp);

    // 4. Persistent memory recall (async fetch, ~50-150ms — worth it)
    try {
      const memories = await this.memoryClient.recall(tenantId, '', userText, 3);
      if (memories.length > 0) {
        const memCtx = memories
          .map(m => `[${m.category}] ${m.key ? m.key + ': ' : ''}${JSON.stringify(m.value)}`)
          .join('\n');
        parts.push(`User memories:\n${memCtx}`);
      }
    } catch { /* non-critical */ }

    const contextPrompt = parts.join('\n\n');
    return { contextPrompt, shouldInject: contextPrompt.trim().length > 0 };
  }
}
