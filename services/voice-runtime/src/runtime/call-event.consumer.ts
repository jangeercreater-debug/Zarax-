import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { EVENT_BUS, type EventBus } from '@zarax/event-bus';
import { APP_CONFIG, type AppConfigService } from '@zarax/shared-config';
import { ZARAX_LOGGER, type ZaraxLogger } from '@zarax/shared-logger';
import type { CallEndedEvent, CallStartedEvent } from '@zarax/shared-types';

import { AgentConfigClient } from '../clients/agent-config.client';
import { LlmClient } from '../clients/llm.client';
import type { VoiceRuntimeEnv } from '../config/env.schema';
import { SessionRegistry } from '../session/session-registry.service';
import { VoiceSession } from '../session/voice-session';

@Injectable()
export class CallEventConsumer implements OnModuleInit {
  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    @Inject(APP_CONFIG) private readonly config: AppConfigService<VoiceRuntimeEnv>,
    @Inject(ZARAX_LOGGER) private readonly logger: ZaraxLogger,
    private readonly sessionRegistry: SessionRegistry,
    private readonly agentConfigClient: AgentConfigClient,
    private readonly llmClient: LlmClient,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe('call.started', (event: CallStartedEvent) => {
      void this.onCallStarted(event);
    });

    this.eventBus.subscribe('call.ended', (event: CallEndedEvent) => {
      void this.onCallEnded(event);
    });

    this.logger.log('CallEventConsumer: subscribed to call.started / call.ended');
  }

  private async onCallStarted(event: CallStartedEvent): Promise<void> {
    const { callId, agentId, roomName } = event.payload;
    const tenantId = event.tenantId;

    this.logger.log('CallEventConsumer: call.started', { callId, agentId, roomName });

    let agentConfig;
    try {
      agentConfig = await this.agentConfigClient.getAgentConfig(agentId);
    } catch (error) {
      this.logger.error('CallEventConsumer: could not fetch agent config — call cannot start', {
        callId,
        agentId,
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    const session = new VoiceSession({
      callId,
      agentId,
      tenantId,
      roomName,
      agentConfig,
      livekitUrl: this.config.get('LIVEKIT_URL'),
      livekitApiKey: this.config.get('LIVEKIT_API_KEY'),
      livekitApiSecret: this.config.get('LIVEKIT_API_SECRET'),
      sttServiceUrl: this.config.get('STT_SERVICE_URL'),
      sttInternalToken: this.config.get('STT_INTERNAL_SERVICE_TOKEN'),
      ttsServiceUrl: this.config.get('TTS_SERVICE_URL'),
      ttsInternalToken: this.config.get('TTS_INTERNAL_SERVICE_TOKEN'),
      sampleRate: this.config.get('AUDIO_SAMPLE_RATE'),
      numChannels: this.config.get('AUDIO_CHANNELS'),
      silenceTimeoutMs: this.config.get('SILENCE_TIMEOUT_MS'),
      llmClient: this.llmClient,
      logger: this.logger,
      openAiApiKey: this.config.get('OPENAI_API_KEY'),
      openAiModel: this.config.get('OPENAI_REALTIME_MODEL'),
      openAiVoice: this.config.get('OPENAI_REALTIME_VOICE'),
    });

    this.sessionRegistry.register(callId, session);

    try {
      await session.start();
    } catch (error) {
      this.logger.error('CallEventConsumer: session failed to start', {
        callId,
        message: error instanceof Error ? error.message : String(error),
      });
      await session.end().catch(() => undefined);
      this.sessionRegistry.delete(callId);
    }
  }

  private async onCallEnded(event: CallEndedEvent): Promise<void> {
    const { callId } = event.payload;
    const session = this.sessionRegistry.get(callId);
    if (!session) return; // Already ended or was a web_widget call

    this.logger.log('CallEventConsumer: call.ended — tearing down session', { callId });
    await session.end().catch((error: unknown) => {
      this.logger.error('CallEventConsumer: error ending session', {
        callId,
        message: error instanceof Error ? error.message : String(error),
      });
    });
    this.sessionRegistry.delete(callId);
  }
}
