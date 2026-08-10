import { Module } from '@nestjs/common';
import { IntentDetector } from './intent-detector';
import { ReasoningEngine } from './reasoning-engine';
import { DecisionEngine } from './decision-engine';
import { CompanionEngine } from './companion-engine';
import { HabitsTracker } from './habits-tracker';
import { ConversationIntelligence } from './conversation-intelligence';
import { EmotionDetector } from './emotion-detector';
import { EmotionalAdaptationEngine } from './emotional-adaptation';

@Module({
  providers: [
    IntentDetector, ReasoningEngine, DecisionEngine, CompanionEngine,
    HabitsTracker, ConversationIntelligence, EmotionDetector, EmotionalAdaptationEngine,
  ],
  exports: [
    IntentDetector, ReasoningEngine, DecisionEngine, CompanionEngine,
    HabitsTracker, ConversationIntelligence, EmotionDetector, EmotionalAdaptationEngine,
  ],
})
export class IntelligenceModule {}
