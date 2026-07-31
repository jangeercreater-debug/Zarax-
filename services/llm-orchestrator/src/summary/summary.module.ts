import { Module } from '@nestjs/common';
import { ConversationStateModule } from '../conversation-state/conversation-state.module';
import { SummaryService } from './summary.service';
import { SummaryController } from './summary.controller';

@Module({
  imports: [ConversationStateModule],
  controllers: [SummaryController],
  providers: [SummaryService],
  exports: [SummaryService],
})
export class SummaryModule {}
