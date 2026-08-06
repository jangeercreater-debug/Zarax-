import { Module } from '@nestjs/common';
import { IntentDetector } from './intent-detector';
import { ReasoningEngine } from './reasoning-engine';
import { DecisionEngine } from './decision-engine';
import { CompanionEngine } from './companion-engine';
import { HabitsTracker } from './habits-tracker';
import { ConversationIntelligence } from './conversation-intelligence';

@Module({
  providers: [IntentDetector, ReasoningEngine, DecisionEngine, CompanionEngine, HabitsTracker, ConversationIntelligence],
  exports: [IntentDetector, ReasoningEngine, DecisionEngine, CompanionEngine, HabitsTracker, ConversationIntelligence],
})
export class IntelligenceModule {}
