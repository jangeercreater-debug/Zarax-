import { Module } from '@nestjs/common';

import { InternalAgentController } from './internal-agent.controller';

@Module({ controllers: [InternalAgentController] })
export class InternalModule {}
