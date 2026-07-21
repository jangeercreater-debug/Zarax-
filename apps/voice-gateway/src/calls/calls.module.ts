import { Module } from '@nestjs/common';
import { AgentRepository, PRISMA_CLIENT, type PrismaClient } from '@zarax/database';
import { RedisCacheModule } from '@zarax/redis-client';
import { ZARAX_LOGGER, type ZaraxLogger } from '@zarax/shared-logger';

import { LiveKitModule } from '../livekit/livekit.module';
import { LiveKitRoomService } from '../livekit/livekit-room.service';
import { OutboundCallService } from './outbound-call.service';
import { CallSessionService } from './call-session.service';

@Module({
  imports: [
    LiveKitModule,
    RedisCacheModule.forRoot({ redisUrl: process.env.REDIS_URL ?? '' }),
  ],
  providers: [
    CallSessionService,
    OutboundCallService,
    {
      provide: LiveKitRoomService,
      useFactory: (logger: ZaraxLogger): LiveKitRoomService =>
        new LiveKitRoomService(
          process.env.LIVEKIT_URL ?? '',
          process.env.LIVEKIT_API_KEY ?? '',
          process.env.LIVEKIT_API_SECRET ?? '',
          logger,
        ),
      inject: [ZARAX_LOGGER],
    },
    {
      provide: AgentRepository,
      useFactory: (prisma: PrismaClient) => new AgentRepository(prisma),
      inject: [PRISMA_CLIENT],
    },
  ],
  exports: [CallSessionService, OutboundCallService],
})
export class CallsModule {}
