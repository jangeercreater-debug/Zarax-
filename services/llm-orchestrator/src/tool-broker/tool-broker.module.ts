import { Module } from '@nestjs/common';

import { ToolCallBroker } from './tool-call-broker';

@Module({
  providers: [ToolCallBroker],
  exports: [ToolCallBroker],
})
export class ToolBrokerModule {}
