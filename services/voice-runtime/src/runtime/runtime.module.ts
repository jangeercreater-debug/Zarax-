import { Module } from '@nestjs/common';

import { AgentConfigClient } from '../clients/agent-config.client';
import { LlmClient } from '../clients/llm.client';
import { SessionRegistry } from '../session/session-registry.service';
import { CallEventConsumer } from './call-event.consumer';

@Module({
  providers: [AgentConfigClient, LlmClient, SessionRegistry, CallEventConsumer],
})
export class RuntimeModule {}
