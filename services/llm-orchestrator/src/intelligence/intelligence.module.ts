import { Module } from '@nestjs/common';
import { IntentDetector } from './intent-detector';
import { ReasoningEngine } from './reasoning-engine';
import { DecisionEngine } from './decision-engine';
import { CompanionEngine } from './companion-engine';
import { HabitsTracker } from './habits-tracker';
import { ConversationIntelligence } from './conversation-intelligence';
import { EmotionDetector } from './emotion-detector';
import { EmotionalAdaptationEngine } from './emotional-adaptation';
import { ProactiveCompanionEngine } from './proactive-companion';
import { LanguageDetector } from './language-detector';

@Module({
  providers: [
    IntentDetector,
    ReasoningEngine,
    DecisionEngine,
    CompanionEngine,
    HabitsTracker,
    ConversationIntelligence,
    EmotionDetector,
    EmotionalAdaptationEngine,
    ProactiveCompanionEngine,
    LanguageDetector,
  ],
  exports: [
    IntentDetector,
    ReasoningEngine,
    DecisionEngine,
    CompanionEngine,
    HabitsTracker,
    ConversationIntelligence,
    EmotionDetector,
    EmotionalAdaptationEngine,
    ProactiveCompanionEngine,
    LanguageDetector,
  ],
})
export class IntelligenceModule {}
