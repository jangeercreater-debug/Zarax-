import { Module } from '@nestjs/common';
import { IntentDetector } from './intent-detector';
import { ReasoningEngine } from './reasoning-engine';
import { DecisionEngine } from './decision-engine';

@Module({
  providers: [IntentDetector, ReasoningEngine, DecisionEngine],
  exports: [DecisionEngine],
})
export class IntelligenceModule {}
