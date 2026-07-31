import { Module } from '@nestjs/common';
import { IntentDetector } from './intent-detector';
import { ReasoningEngine } from './reasoning-engine';
import { DecisionEngine } from './decision-engine';
import { CompanionEngine } from './companion-engine';
import { HabitsTracker } from './habits-tracker';

@Module({
  providers: [IntentDetector, ReasoningEngine, DecisionEngine, CompanionEngine, HabitsTracker],
  exports: [DecisionEngine, CompanionEngine, HabitsTracker],
})
export class IntelligenceModule {}
