import { Injectable } from '@nestjs/common';
import type { TenantId } from '@zarax/shared-types';

import { MemoryClient } from '../memory-client/memory-client';
import { IntentDetector } from '../intelligence/intent-detector';
import { DecisionEngine } from '../intelligence/decision-engine';
import { ConversationIntelligence } from '../intelligence/conversation-intelligence';
import { EmotionDetector } from '../intelligence/emotion-detector';
import { EmotionalAdaptationEngine } from '../intelligence/emotional-adaptation';
import { LanguageDetector } from '../intelligence/language-detector';

export interface IntelligenceContextResult {
  contextPrompt: string;
  shouldInject: boolean;
}

@Injectable()
export class IntelligenceContextService {
  constructor(
    private readonly memoryClient: MemoryClient,
    private readonly intentDetector: IntentDetector,
    private readonly decisionEngine: DecisionEngine,
    private readonly conversationIntelligence: ConversationIntelligence,
    private readonly emotionDetector: EmotionDetector,
    private readonly emotionalAdaptation: EmotionalAdaptationEngine,
    private readonly languageDetector: LanguageDetector,
  ) {}

  async buildContext(
    tenantId: TenantId,
    callId: string,
    _agentId: string,
    userText: string,
  ): Promise<IntelligenceContextResult> {
    const parts: string[] = [];

    // Phase 6: Emotion detection + adaptation (local, ~0ms)
    const emotion = this.emotionDetector.detect(userText);
    const emotionPrompt = this.emotionalAdaptation.generatePrompt(emotion);
    if (emotionPrompt) parts.push(emotionPrompt);

    // Phase 4: Intent + pacing (local, ~0ms)
    const intent = this.intentDetector.detect(userText);
    const decision = this.decisionEngine.decide(intent.intent);
    if (decision.reasoning.pacingHint) {
      parts.push(`[Pacing] ${decision.reasoning.pacingHint}`);
    }

    // Phase 8: Language lock (local, ~0ms)
    const langResult = this.languageDetector.detectAndLock(callId, userText);
    if (langResult.language !== 'unknown') {
      parts.push(langResult.instruction);
    }

    // Phase 8: Night mode (local, ~0ms)
    const hour = new Date().getHours();
    if (hour >= 22 || hour < 5) {
      parts.push('[Night mode] Speak softly and gently. Lower energy. Be warm and intimate.');
    }

    // Phase 4: Conversation intelligence (local, ~0ms)
    const topicHint = this.conversationIntelligence.processUserTurn(callId, userText);
    if (topicHint) parts.push(topicHint);

    const antiRepeat = this.conversationIntelligence.getAntiRepetitionHint(callId);
    if (antiRepeat) parts.push(antiRepeat);

    const followUp = this.conversationIntelligence.getFollowUpHint(callId);
    if (followUp) parts.push(followUp);

    // Phase 5: Persistent memory recall (~50-150ms — worth it)
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
