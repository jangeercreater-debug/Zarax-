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
import { OpenAiRealtimeClient } from '../audio/openai-realtime-client';

type SessionState = 'connecting' | 'standby' | 'listening' | 'transcribing' | 'generating' | 'speaking' | 'ended';

const OPENAI_SAMPLE_RATE = 24000;
const MAX_RECONNECT_ATTEMPTS = 5;
const NOISE_GATE_THRESHOLD = 50;

function isWakeWord(text: string): boolean {
  return /\bzarax\b/i.test(text);
}

function isStandbyPhrase(text: string): boolean {
  const t = text.toLowerCase().trim();
  return t.includes('stop for now') || t.includes('go to sleep') || t === 'stop' || t.startsWith('stop, ') || t.startsWith('stop.');
}

function applyNoiseGate(pcm: Buffer, threshold: number): Buffer {
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2);
  let energy = 0;
  for (let i = 0; i < samples.length; i++) {
    energy += Math.abs(samples[i] ?? 0);
  }
  const avgEnergy = energy / (samples.length || 1);
  if (avgEnergy < threshold) {
    return Buffer.alloc(pcm.length); // silence
  }
  return pcm;
}

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
  openAiApiKey?: string;
  openAiModel?: string;
  openAiVoice?: string;
}

export class VoiceSession {
  private state: SessionState = 'connecting';
  private readonly room = new Room();
  private publisher!: LiveKitAudioPublisher;
  private sttClient!: SttClient;
  private currentTts: TtsClient | null = null;
  private realtimeClient: OpenAiRealtimeClient | null = null;
  private wakeWordEnabled = false;
  private interimText = '';
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private turnCount = 0;
  private reconnectAttempts = 0;
  private transcriptLog: Array<{ role: string; text: string; ts: number }> = [];
  private isSpeaking = false;
  private metrics = {
    firstResponseMs: 0,
    avgLatencyMs: 0,
    latencyCount: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    reconnects: 0,
    errors: 0,
  };
  readonly startedAt = Date.now();

  constructor(private readonly opts: VoiceSessionOptions) {}

  async start(): Promise<void> {
    try {
      const token = this.mintAgentToken();
      await this.room.connect(this.opts.livekitUrl, token);

      this.opts.logger.log('VoiceSession: joined room', {
        callId: this.opts.callId,
        roomName: this.opts.roomName,
        mode: this.opts.openAiApiKey ? 'realtime' : 'legacy',
      });

      // Room disconnect handler
      this.room.on(RoomEvent.Disconnected, () => {
        if (this.state !== 'ended') {
          this.opts.logger.warn('VoiceSession: room disconnected unexpectedly', { callId: this.opts.callId });
          void this.end();
        }
      });

      if (this.opts.openAiApiKey) {
        this.publisher = new LiveKitAudioPublisher(this.room, OPENAI_SAMPLE_RATE, this.opts.numChannels);
        await this.publisher.start();
        await this.startRealtimeSession();
        return;
      }

      this.publisher = new LiveKitAudioPublisher(this.room, this.opts.sampleRate, this.opts.numChannels);
      await this.publisher.start();

      this.wakeWordEnabled = Boolean((this.opts.agentConfig as Record<string, unknown>).wakeWordEnabled);

      if (this.wakeWordEnabled) {
        this.state = 'standby';
        await this.waitForCallerToJoin();
        this.setupStt();
        this.subscribeToCallerAudio();
        return;
      }

      await this.waitForCallerToJoin();

      if (this.opts.agentConfig.welcomeMessage) {
        await this.speak(this.opts.agentConfig.welcomeMessage);
      }

      this.setupStt();
      this.startListening();
      this.subscribeToCallerAudio();
    } catch (error) {
      this.opts.logger.error('VoiceSession: start failed', {
        callId: this.opts.callId,
        message: error instanceof Error ? error.message : String(error),
      });
      await this.end();
    }
  }

  private async startRealtimeSession(): Promise<void> {
    await this.waitForCallerToJoin();

    const basePrompt = this.opts.agentConfig.systemPrompt ??
      'You are Zarax, a warm, intelligent female AI companion. Speak naturally like a real human friend.';

    // Fetch memories
    let memoryContext = '';
    try {
      const memoryUrl = process.env.API_SERVICE_URL ?? 'http://localhost:3000';
      const memoryToken = process.env.API_INTERNAL_SERVICE_TOKEN ?? '';
      const res = await fetch(memoryUrl + '/v1/memory/search?q=user+preferences', {
        headers: { 'Authorization': 'Bearer ' + memoryToken, 'X-Tenant-Id': this.opts.tenantId },
        signal: AbortSignal.timeout(3000),
      }).catch(() => null);
      if (res?.ok) {
        const data = await res.json() as { items?: Array<{ category: string; key: string | null; value: unknown }> };
        if (data.items && data.items.length > 0) {
          memoryContext = '\n\nUser memories:\n' + data.items
            .map(m => `[${m.category}] ${m.key ? m.key + ': ' : ''}${JSON.stringify(m.value)}`)
            .join('\n');
        }
      }
    } catch { /* non-critical */ }

    this.realtimeClient = new OpenAiRealtimeClient({
      apiKey: this.opts.openAiApiKey!,
      model: this.opts.openAiModel ?? 'gpt-4o-realtime-preview-2025-06-03',
      voice: this.opts.openAiVoice ?? 'shimmer',
      systemPrompt: basePrompt + memoryContext,
      callId: this.opts.callId,
    });

    this.setupRealtimeHandlers();
    this.realtimeClient.connect();
    this.subscribeToCallerAudioRealtime();
  }

  private setupRealtimeHandlers(): void {
    if (!this.realtimeClient) return;

    this.realtimeClient.on('ready', (info: { setupLatencyMs: number }) => {
      this.state = 'listening';
      this.reconnectAttempts = 0;
      this.opts.logger.log('VoiceSession: Realtime ready', {
        callId: this.opts.callId,
        setupLatencyMs: info.setupLatencyMs,
      });
      if (this.opts.agentConfig.welcomeMessage) {
        this.realtimeClient?.sendText(this.opts.agentConfig.welcomeMessage);
      }
    });

    this.realtimeClient.on('audio', async (pcm: Buffer) => {
      this.state = 'speaking';
      this.isSpeaking = true;
      await this.publisher.push(pcm).catch(() => undefined);
    });

    this.realtimeClient.on('speak_done', async () => {
      await this.publisher.flush().catch(() => undefined);
      this.isSpeaking = false;
      this.state = 'listening';
    });

    this.realtimeClient.on('speech_started', async () => {
      // Barge-in: cancel current response, clear audio buffer
      if (this.isSpeaking) {
        this.realtimeClient?.cancel();
        await this.publisher.stop().catch(() => undefined);
        await this.publisher.start().catch(() => undefined);
        this.isSpeaking = false;
        this.opts.logger.log('VoiceSession: barge-in', { callId: this.opts.callId });
      }
      this.state = 'listening';
    });

    this.realtimeClient.on('transcript', (text: string) => {
      this.turnCount++;
      this.transcriptLog.push({ role: 'user', text, ts: Date.now() });
      this.opts.logger.log('VoiceSession: user said', { callId: this.opts.callId, turn: this.turnCount, text });
    });

    this.realtimeClient.on('latency', (info: { firstResponseMs: number }) => {
      this.metrics.firstResponseMs = info.firstResponseMs;
      this.metrics.latencyCount++;
      this.metrics.avgLatencyMs = Math.round(
        ((this.metrics.avgLatencyMs * (this.metrics.latencyCount - 1)) + info.firstResponseMs) / this.metrics.latencyCount
      );
      this.opts.logger.log('VoiceSession: latency', {
        callId: this.opts.callId,
        firstResponseMs: info.firstResponseMs,
        avgLatencyMs: this.metrics.avgLatencyMs,
      });
    });

    this.realtimeClient.on('usage', (usage: { inputTokens: number; outputTokens: number }) => {
      this.metrics.totalInputTokens += usage.inputTokens;
      this.metrics.totalOutputTokens += usage.outputTokens;
    });

    this.realtimeClient.on('error', (err: Error) => {
      this.metrics.errors++;
      this.opts.logger.error('VoiceSession: realtime error', {
        callId: this.opts.callId,
        message: err.message,
        totalErrors: this.metrics.errors,
      });
    });

    this.realtimeClient.on('done', (code: number) => {
      if (this.state === 'ended') return;
      this.opts.logger.warn('VoiceSession: realtime disconnected', {
        callId: this.opts.callId,
        code,
      });
      void this.attemptReconnect();
    });
  }

  private async attemptReconnect(): Promise<void> {
    if (this.state === 'ended') return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.opts.logger.error('VoiceSession: max reconnects reached, ending', { callId: this.opts.callId });
      await this.end();
      return;
    }

    this.reconnectAttempts++;
    this.metrics.reconnects++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 8000);
    this.opts.logger.log('VoiceSession: reconnecting', {
      callId: this.opts.callId,
      attempt: this.reconnectAttempts,
      delayMs: delay,
    });

    await new Promise(r => setTimeout(r, delay));
    if (this.state === 'ended') return;

    this.realtimeClient?.close();
    await this.startRealtimeSession().catch(async (err: Error) => {
      this.opts.logger.error('VoiceSession: reconnect failed', {
        callId: this.opts.callId,
        message: err.message,
      });
      await this.end();
    });
  }

  private subscribeToCallerAudioRealtime(): void {
    this.room.on(RoomEvent.TrackSubscribed, (track: unknown, _pub: unknown, participant: unknown) => {
      const t = track as { kind: number };
      const p = participant as { identity: string };
      if (t.kind !== TrackKind.KIND_AUDIO) return;
      if (p.identity.startsWith('agent-')) return;

      const stream = new AudioStream(track as never, OPENAI_SAMPLE_RATE, this.opts.numChannels);
      void (async () => {
        for await (const frame of stream as AsyncIterable<AudioFrame>) {
          if (this.state === 'ended') break;
          let pcm = Buffer.from(frame.data.buffer);
          // Noise gate: suppress low-energy audio
          pcm = applyNoiseGate(pcm, NOISE_GATE_THRESHOLD);
          // Echo suppression: don't send audio back while speaking
          if (!this.isSpeaking) {
            this.realtimeClient?.sendAudio(pcm);
          }
        }
      })();
    });
  }

  private mintAgentToken(): string {
    const at = new AccessToken(this.opts.livekitApiKey, this.opts.livekitApiSecret, {
      identity: `agent-${this.opts.callId}`,
    });
    at.addGrant({ roomJoin: true, room: this.opts.roomName, canPublish: true, canSubscribe: true });
    return at.toJwt() as unknown as string;
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
        this.currentTts?.cancel();
        this.currentTts = null;
        await this.publisher.stop();
        await this.publisher.start();
        this.startListening();
        this.clearSilenceTimer();
        return;
      }

      if (event.type === 'transcript') {
        if (event.isFinal) {
          this.clearSilenceTimer();
          this.interimText = '';
          if (event.text.trim()) await this.handleFinalTranscript(event.text);
          else this.startListening();
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
      this.opts.logger.error('VoiceSession: STT error', { callId: this.opts.callId, message: error.message });
    });

    this.sttClient.connect();
  }

  private subscribeToCallerAudio(): void {
    this.room.on(RoomEvent.TrackSubscribed, (track: unknown, _pub: unknown, participant: unknown) => {
      const t = track as { kind: number };
      const p = participant as { identity: string };
      if (t.kind !== TrackKind.KIND_AUDIO) return;
      if (p.identity.startsWith('agent-')) return;

      const audioStream = new AudioStream(track as never);
      void (async () => {
        for await (const frame of audioStream as AsyncIterable<AudioFrame>) {
          if (this.state === 'ended') break;
          if (this.state === 'listening' || this.state === 'transcribing' || this.state === 'standby') {
            let pcm = Buffer.from(frame.data.buffer);
            pcm = applyNoiseGate(pcm, NOISE_GATE_THRESHOLD);
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
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
  }

  private async handleFinalTranscript(text: string): Promise<void> {
    if (this.state === 'ended') return;

    if (this.wakeWordEnabled) {
      if (this.state === 'standby') {
        if (isWakeWord(text)) {
          await this.speak("Hi, I'm listening.");
          this.startListening();
        } else { this.state = 'standby'; }
        return;
      }
      if (isStandbyPhrase(text)) {
        this.currentTts?.cancel();
        await this.speak("Okay, I'll stop for now. Say Zarax whenever you need me.");
        this.state = 'standby';
        return;
      }
      const cleaned = text.replace(/^zarax[,.]?\s*/i, '').trim();
      if (cleaned.length > 0) return this.handleFinalTranscript(cleaned);
    }

    this.state = 'generating';
    this.turnCount++;
    this.transcriptLog.push({ role: 'user', text, ts: Date.now() });

    let result;
    try {
      result = await this.opts.llmClient.submitTurn(this.opts.callId, this.opts.agentId, this.opts.tenantId, text);
    } catch (error) {
      this.metrics.errors++;
      this.opts.logger.error('VoiceSession: LLM failed', { callId: this.opts.callId, message: error instanceof Error ? error.message : String(error) });
      await this.speak("I'm having trouble right now. Please try again.");
      this.startListening();
      return;
    }

    if (result.shouldEndCall) {
      if (result.response) await this.speak(result.response);
      await this.end();
      return;
    }

    this.transcriptLog.push({ role: 'assistant', text: result.response, ts: Date.now() });
    await this.speak(result.response);
    this.startListening();
  }

  private async speak(text: string): Promise<void> {
    if (this.state === 'ended') return;
    this.state = 'speaking';
    this.isSpeaking = true;

    const tts = new TtsClient({
      ttsServiceUrl: this.opts.ttsServiceUrl,
      internalToken: this.opts.ttsInternalToken,
      callId: this.opts.callId,
      voiceId: this.opts.agentConfig.voiceId,
    });
    this.currentTts = tts;

    await new Promise<void>((resolve) => {
      tts.onAudio(async (chunk: Buffer) => {
        if (this.state === 'speaking' && this.currentTts === tts) {
          await this.publisher.push(chunk).catch(() => undefined);
        }
      });
      tts.onDone(() => {
        if (this.currentTts === tts) this.currentTts = null;
        this.isSpeaking = false;
        void this.publisher.flush().catch(() => undefined);
        resolve();
      });
      tts.onError((error: Error) => {
        this.opts.logger.error('VoiceSession: TTS error', { callId: this.opts.callId, message: error.message });
        if (this.currentTts === tts) this.currentTts = null;
        this.isSpeaking = false;
        resolve();
      });
      tts.connect();
      tts.synthesize(text);
    });
  }

  private async waitForCallerToJoin(): Promise<void> {
    if (this.room.remoteParticipants.size > 0) return;
    await new Promise<void>((resolve) => {
      let settled = false;
      const timer = setTimeout(() => finish(), 120000);
      const finish = (): void => {
        if (settled) return;
        settled = true;
        this.room.off(RoomEvent.ParticipantConnected, onJoin);
        clearTimeout(timer);
        resolve();
      };
      const onJoin = (): void => finish();
      this.room.on(RoomEvent.ParticipantConnected, onJoin);
    });
  }

  async end(): Promise<void> {
    if (this.state === 'ended') return;
    this.state = 'ended';

    this.clearSilenceTimer();
    this.currentTts?.cancel();
    this.currentTts = null;
    this.realtimeClient?.close();
    this.realtimeClient = null;
    this.sttClient?.close();

    // Generate conversation summary
    if (this.transcriptLog.length >= 2) {
      try {
        const summaryUrl = process.env.LLM_ORCHESTRATOR_URL ?? 'http://localhost:3006';
        const summaryToken = process.env.LLM_ORCHESTRATOR_SERVICE_ACCOUNT_TOKEN ?? '';
        await fetch(summaryUrl + '/v1/summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Service-Account-Token': summaryToken },
          body: JSON.stringify({ tenantId: this.opts.tenantId, callId: this.opts.callId, userId: '' }),
          signal: AbortSignal.timeout(10000),
        }).catch(() => undefined);
      } catch { /* non-critical */ }
    }

    try {
      await this.publisher?.stop();
      await this.room.disconnect();
    } catch { /* best-effort */ }

    this.opts.logger.log('VoiceSession: ended', {
      callId: this.opts.callId,
      turns: this.turnCount,
      durationMs: Date.now() - this.startedAt,
      transcriptEntries: this.transcriptLog.length,
      metrics: this.metrics,
    });
  }

  get isActive(): boolean {
    return this.state !== 'ended';
  }
}
