import { Module } from '@nestjs/common';
import { AgentRepository, PRISMA_CLIENT, type PrismaClient } from '@zarax/database';

import { CallsModule } from '../calls/calls.module';
import { LiveKitModule } from '../livekit/livekit.module';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  imports: [LiveKitModule, CallsModule],
  controllers: [RoomsController],
  providers: [
    RoomsService,
    {
      provide: AgentRepository,
      useFactory: (prisma: PrismaClient) => new AgentRepository(prisma),
      inject: [PRISMA_CLIENT],
    },
  ],
})
export class RoomsModule {}
