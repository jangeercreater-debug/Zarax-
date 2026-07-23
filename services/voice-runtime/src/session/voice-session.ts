import {
  AudioFrame,
  AudioStream,
  Room,
  RoomEvent,
  TrackKind,
} from '@livekit/rtc-node';
import { AccessToken } from 'livekit-server-sdk';
import type { ZaraxLogger } from '@zarax/shared-logger';

import type { AgentConfig } from '../clients/agent-config.client';
import type { LlmClient } from '../clients/llm.client';
import { SttClient, type SttEvent } from '../audio/stt-client';
import { TtsClient } from '../audio/tts-client';
import { LiveKitAudioPublisher } from '../audio/livekit-audio-publisher';

// Cartesia voice used when an agent has no explicit voice selected -- the builder's
// "Default voice" option stores no voiceId, and Cartesia requires a concrete id.
const DEFAULT_VOICE_ID = 'a0e99841-438c-4a64-b679-ae501e7d6091';

type SessionState = 'connecting' | 'listening' | 'transcribing' | 'generating' | 'speaking' | 'ended';

export interface VoiceSessionOptions {
  callId: string;
  agentId: string;
  tenantId: string;
  roomName: string;
  agentConfig: AgentConfig;
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  sttServiceUrl: string;
  sttInternalToken: string;
  ttsServiceUrl: string;
  ttsInternalToken: string;
  sampleRate: number;
  numChannels: number;
  silenceTimeoutMs: number;
  llmClient: LlmClient;
  logger: ZaraxLogger;
}

export class VoiceSession {
  private state: SessionState = 'connecting';
  private readonly room = new Room();
  private publisher!: LiveKitAudioPublisher;
  private sttClient!: SttClient;
  private currentTts: TtsClient | null = null;
  private interimText = '';
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private turnCount = 0;
  readonly startedAt = Date.now();

  constructor(private readonly opts: VoiceSessionOptions) {}

  async start(): Promise<void> {
    const token = await this.mintAgentToken();
    await this.room.connect(this.opts.livekitUrl, token);

    this.opts.logger.log('VoiceSession: joined room', {
      callId: this.opts.callId,
      roomName: this.opts.roomName,
    });

    this.publisher = new LiveKitAudioPublisher(this.room, this.opts.sampleRate, this.opts.numChannels);
    this.opts.logger.log('VoiceSession: publishing track', { callId: this.opts.callId });
    await this.publisher.start();
    this.opts.logger.log('VoiceSession: track published', { callId: this.opts.callId });

    this.setupStt();

    this.opts.logger.log('VoiceSession: welcome check', {
      callId: this.opts.callId,
      hasWelcome: Boolean(this.opts.agentConfig.welcomeMessage),
    });
    if (this.opts.agentConfig.welcomeMessage) {
      await this.speak(this.opts.agentConfig.welcomeMessage);
      this.opts.logger.log('VoiceSession: welcome done', { callId: this.opts.callId });
    }

    this.startListening();
    this.subscribeToCallerAudio();
  }

  private async mintAgentToken(): Promise<string> {
    const at = new AccessToken(this.opts.livekitApiKey, this.opts.livekitApiSecret, {
      identity: `agent-${this.opts.callId}`,
    });
    at.addGrant({ roomJoin: true, room: this.opts.roomName, canPublish: true, canSubscribe: true });
    // livekit-server-sdk v2's toJwt() is async. Casting instead of awaiting yields a
    // Promise object, which stringifies to "[object Promise]" and makes the LiveKit
    // signal server reject the connection with a 401.
    return at.toJwt();
  }

  private setupStt(): void {
    this.sttClient = new SttClient({
      sttServiceUrl: this.opts.sttServiceUrl,
      internalToken: this.opts.sttInternalToken,
      callId: this.opts.callId,
      sttModel: this.opts.agentConfig.sttModel,
    });

    this.sttClient.onEvent(async (event: SttEvent) => {
      if (this.state === 'ended') return;

      if (event.type === 'speech_started' && this.state === 'speaking') {
        // Barge-in
        this.currentTts?.cancel();
        this.currentTts = null;
        await this.publisher.stop();
        await this.publisher.start();
        this.opts.logger.log('VoiceSession: barge-in', { callId: this.opts.callId });
        this.startListening();
        this.clearSilenceTimer();
        return;
      }

      if (event.type === 'transcript') {
        if (event.isFinal) {
          this.clearSilenceTimer();
          this.interimText = '';
          if (event.text.trim()) {
            await this.handleFinalTranscript(event.text);
          } else {
            this.startListening();
          }
        } else {
          this.interimText = event.text;
          this.resetSilenceTimer();
        }
      }

      if (event.type === 'utterance_end' && this.interimText.trim()) {
        this.clearSilenceTimer();
        const text = this.interimText;
        this.interimText = '';
        await this.handleFinalTranscript(text);
      }
    });

    this.sttClient.onError((error: Error) => {
      this.opts.logger.error('VoiceSession: STT error', {
        callId: this.opts.callId,
        message: error.message,
      });
    });

    this.sttClient.connect();
  }

  private subscribeToCallerAudio(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.room.on(RoomEvent.TrackSubscribed, (track: any, _publication: unknown, participant: any) => {
      if ((track.kind as number) !== TrackKind.KIND_AUDIO) return;
      if ((participant.identity as string).startsWith('agent-')) return;

      const audioStream = new AudioStream(track);
      void (async () => {
        for await (const frame of audioStream as AsyncIterable<AudioFrame>) {
          if (this.state === 'ended') break;
          if (this.state === 'listening' || this.state === 'transcribing') {
            const pcm = Buffer.from(frame.data.buffer);
            this.sttClient.sendAudio(pcm);
          }
        }
      })();
    });
  }

  private startListening(): void {
    if (this.state === 'ended') return;
    this.state = 'listening';
    this.interimText = '';
  }

  private resetSilenceTimer(): void {
    this.clearSilenceTimer();
    this.silenceTimer = setTimeout(async () => {
      if (this.interimText.trim() && (this.state === 'listening' || this.state === 'transcribing')) {
        const text = this.interimText;
        this.interimText = '';
        await this.handleFinalTranscript(text);
      }
    }, this.opts.silenceTimeoutMs);
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private async handleFinalTranscript(text: string): Promise<void> {
    if (this.state === 'ended') return;
    this.state = 'generating';
    this.turnCount++;

    this.opts.logger.log('VoiceSession: transcript', {
      callId: this.opts.callId,
      turn: this.turnCount,
      text,
    });

    let result;
    try {
      result = await this.opts.llmClient.submitTurn(
        this.opts.callId,
        this.opts.agentId,
        this.opts.tenantId,
        text,
      );
    } catch (error) {
      this.opts.logger.error('VoiceSession: LLM failed', {
        callId: this.opts.callId,
        message: error instanceof Error ? error.message : String(error),
      });
      await this.speak("I'm having trouble right now. Please try again in a moment.");
      this.startListening();
      return;
    }

    if (result.shouldEndCall) {
      if (result.response) await this.speak(result.response);
      await this.end();
      return;
    }

    await this.speak(result.response);
    this.startListening();
  }

  private async speak(text: string): Promise<void> {
    if (this.state === 'ended') return;
    this.state = 'speaking';

    const tts = new TtsClient({
      ttsServiceUrl: this.opts.ttsServiceUrl,
      internalToken: this.opts.ttsInternalToken,
      callId: this.opts.callId,
      voiceId: this.opts.agentConfig.voiceId ?? DEFAULT_VOICE_ID,
    });
    this.currentTts = tts;

    let chunkCount = 0;
    let byteCount = 0;

    await new Promise<void>((resolve) => {
      tts.onAudio(async (chunk: Buffer) => {
        chunkCount += 1;
        byteCount += chunk.length;
        if (this.state === 'speaking' && this.currentTts === tts) {
          await this.publisher.push(chunk).catch((error: Error) => {
            this.opts.logger.error('VoiceSession: audio push failed', {
              callId: this.opts.callId,
              message: error.message,
            });
          });
        }
      });
      tts.onDone(() => {
        this.opts.logger.log('VoiceSession: speak done', { callId: this.opts.callId, chunkCount, byteCount });
        if (this.currentTts === tts) this.currentTts = null;
        void this.publisher.flush().catch((error: Error) => {
          this.opts.logger.error('VoiceSession: audio flush failed', {
            callId: this.opts.callId,
            message: error.message,
          });
        });
        resolve();
      });
      tts.onError((error: Error) => {
        this.opts.logger.error('VoiceSession: TTS error', {
          callId: this.opts.callId,
          message: error.message,
        });
        if (this.currentTts === tts) this.currentTts = null;
        resolve();
      });

      tts.connect();
      tts.synthesize(text);
    });
  }

  async end(): Promise<void> {
    if (this.state === 'ended') return;
    this.state = 'ended';

    this.clearSilenceTimer();
    this.currentTts?.cancel();
    this.currentTts = null;
    this.sttClient?.close();

    try {
      await this.publisher?.stop();
      await this.room.disconnect();
    } catch { /* best-effort */ }

    this.opts.logger.log('VoiceSession: ended', {
      callId: this.opts.callId,
      turns: this.turnCount,
      durationMs: Date.now() - this.startedAt,
    });
  }

  get isActive(): boolean {
    return this.state !== 'ended';
  }
}
