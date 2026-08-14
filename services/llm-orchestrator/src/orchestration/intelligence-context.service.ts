import { Inject, Injectable } from '@nestjs/common';
import { PRISMA_CLIENT, type PrismaClient } from '@zarax/database';
import type { TenantId } from '@zarax/shared-types';

import { MemoryClient } from '../memory-client/memory-client';
import { IntentDetector } from '../intelligence/intent-detector';
import { DecisionEngine } from '../intelligence/decision-engine';
import { ConversationIntelligence } from '../intelligence/conversation-intelligence';
import { EmotionDetector } from '../intelligence/emotion-detector';
import { EmotionalAdaptationEngine } from '../intelligence/emotional-adaptation';

export interface IntelligenceContextResult {
  contextPrompt: string;
  shouldInject: boolean;
}

@Injectable()
export class IntelligenceContextService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly _prisma: PrismaClient,
    private readonly memoryClient: MemoryClient,
    private readonly intentDetector: IntentDetector,
    private readonly decisionEngine: DecisionEngine,
    private readonly conversationIntelligence: ConversationIntelligence,
    private readonly emotionDetector: EmotionDetector,
    private readonly emotionalAdaptation: EmotionalAdaptationEngine,
  ) {}

  async buildContext(
    tenantId: TenantId,
    callId: string,
    _agentId: string,
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

    // 4. Persistent memory recall (~50-150ms)
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
