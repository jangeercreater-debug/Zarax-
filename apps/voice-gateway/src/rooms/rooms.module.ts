import { Module } from '@nestjs/common';
import { AgentRepository, type PrismaClient } from '@zarax/database';

import { PRISMA_CLIENT } from '../common/database.module';
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
