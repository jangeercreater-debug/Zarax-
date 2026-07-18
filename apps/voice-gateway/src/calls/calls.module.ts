import { Module } from '@nestjs/common';
import { AgentRepository, PRISMA_CLIENT, type PrismaClient } from '@zarax/database';
import { RedisCacheModule } from '@zarax/redis-client';

import { OutboundCallService } from './outbound-call.service';
import { CallSessionService } from './call-session.service';

@Module({
  imports: [RedisCacheModule.forRoot({ redisUrl: process.env.REDIS_URL ?? '' })],
  providers: [
    CallSessionService,
    OutboundCallService,
    {
      provide: AgentRepository,
      useFactory: (prisma: PrismaClient) => new AgentRepository(prisma),
      inject: [PRISMA_CLIENT],
    },
  ],
  exports: [CallSessionService, OutboundCallService],
})
export class CallsModule {}
