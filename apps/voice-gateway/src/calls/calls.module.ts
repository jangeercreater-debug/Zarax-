import { Module } from '@nestjs/common';

import { RedisModule } from '../common/redis.module';
import { CallSessionService } from './call-session.service';

@Module({
  imports: [RedisModule],
  providers: [CallSessionService],
  exports: [CallSessionService],
})
export class CallsModule {}
