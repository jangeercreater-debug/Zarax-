import { Module } from '@nestjs/common';
import { RedisCacheModule } from '@zarax/redis-client';

import { CallSessionService } from './call-session.service';

@Module({
  imports: [RedisCacheModule.forRoot({ redisUrl: process.env.REDIS_URL ?? '' })],
  providers: [CallSessionService],
  exports: [CallSessionService],
})
export class CallsModule {}
