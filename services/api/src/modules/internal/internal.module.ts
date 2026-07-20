import { Module } from '@nestjs/common';
import { INTERNAL_SERVICE_TOKEN } from '@zarax/shared-auth';
import { InternalAgentController } from './internal-agent.controller';

@Module({
  controllers: [InternalAgentController],
  providers: [
    {
      provide: INTERNAL_SERVICE_TOKEN,
      useFactory: () => process.env.INTERNAL_SERVICE_TOKEN ?? '',
    },
  ],
})
export class InternalModule {}
