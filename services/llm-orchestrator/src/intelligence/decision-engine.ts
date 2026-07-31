import { Injectable } from '@nestjs/common';
import { IntentDetector, type UserIntent } from './intent-detector';
import { ReasoningEngine, type ReasoningResult } from './reasoning-engine';

export interface Decision {
  intent: UserIntent;
  confidence: number;
  reasoning: ReasoningResult;
  shouldSearchMemory: boolean;
  shouldStoreMemory: boolean;
  emotionalResponse: boolean;
}

@Injectable()
export class DecisionEngine {
  constructor(
    private readonly intentDetector: IntentDetector,
    private readonly reasoningEngine: ReasoningEngine,
  ) {}

  decide(userText: string): Decision {
    const { intent, confidence } = this.intentDetector.detect(userText);
    const reasoning = this.reasoningEngine.plan(intent, userText);

    return {
      intent,
      confidence,
      reasoning,
      shouldSearchMemory: intent === 'memory_recall' || intent === 'question',
      shouldStoreMemory: intent === 'memory_store',
      emotionalResponse: intent === 'emotional',
    };
  }
}
