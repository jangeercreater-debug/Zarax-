import { Module } from '@nestjs/common';
import { RedisCacheModule } from '@zarax/redis-client';

import { ConversationStateService } from './conversation-state.service';

@Module({
  imports: [RedisCacheModule.forRoot({ redisUrl: process.env.REDIS_URL ?? '' })],
  providers: [ConversationStateService],
  exports: [ConversationStateService],
})
export class ConversationStateModule {}
