import { Module } from '@nestjs/common';

import { ToolsModule } from '../tools/tools.module';
import { ToolExecutionConsumer } from './tool-execution.consumer';

@Module({
  imports: [ToolsModule],
  providers: [ToolExecutionConsumer],
})
export class ExecutionModule {}
