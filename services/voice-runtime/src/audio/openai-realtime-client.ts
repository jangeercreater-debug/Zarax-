import WebSocket from 'ws';
import { EventEmitter } from 'node:events';

export interface RealtimeOptions {
  apiKey: string;
  model: string;
  systemPrompt: string;
  voice: string;
  callId: string;
}

/**
 * Production-grade OpenAI Realtime WebSocket client.
 *
 * Key design decision — auto-response is DISABLED (`create_response: false`).
 * voice-session instead calls our intelligence-context endpoint after every
 * speech_stopped event to get per-turn emotion/memory/pacing hints, injects
 * them as a system conversation_item via injectContext(), then fires
 * triggerResponse() to start the actual completion.  This gives all of our
 * Phase 3-6 intelligence (personality, emotion, memory, conversation continuity)
 * on every Realtime turn — not just at session start.
 */
export class OpenAiRealtimeClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private cancelled = false;
  private connectTime = 0;
  private firstAudioTime = 0;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly opts: RealtimeOptions) {
    super();
  }

  connect(): void {
    this.connectTime = Date.now();
    const url = `wss://api.openai.com/v1/realtime?model=${this.opts.model}`;
    this.ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${this.opts.apiKey}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    });

    this.ws.on('open', () => {
      this.sendSessionUpdate();
      this.pingInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.ping();
      }, 25000);
    });

    this.ws.on('message', (data: Buffer) => {
      try {
        const ev = JSON.parse(data.toString()) as Record<string, unknown>;
        this.handleEvent(ev);
      } catch { /* ignore malformed */ }
    });

    this.ws.on('pong', () => { /* keep-alive confirmed */ });
    this.ws.on('error', (err: Error) => { this.emit('error', err); });
    this.ws.on('close', (code: number) => {
      this.clearPing();
      if (!this.cancelled) this.emit('done', code);
    });
  }

  private sendSessionUpdate(): void {
    if (!this.ws) return;
    this.ws.send(JSON.stringify({
      type: 'session.update',
      session: {
        modalities: ['audio', 'text'],
        instructions: this.opts.systemPrompt,
        voice: this.opts.voice,
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: { model: 'whisper-1' },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 600,
          // CRITICAL: false so voice-session can inject intelligence context
          // before every turn instead of OpenAI auto-responding immediately.
          create_response: false,
        },
      },
    }));
    const setupLatency = Date.now() - this.connectTime;
    this.emit('ready', { setupLatencyMs: setupLatency });
  }

  private handleEvent(ev: Record<string, unknown>): void {
    const type = ev.type as string;

    if (type === 'response.audio.delta') {
      if (this.firstAudioTime === 0) {
        this.firstAudioTime = Date.now();
        this.emit('latency', { firstResponseMs: this.firstAudioTime - this.connectTime });
      }
      const delta = ev.delta as string;
      if (delta) this.emit('audio', Buffer.from(delta, 'base64'));
    }

    if (type === 'response.audio.done') {
      this.firstAudioTime = 0;
      this.emit('speak_done');
    }

    if (type === 'input_audio_buffer.speech_started') {
      this.firstAudioTime = 0;
      this.emit('speech_started');
    }

    // speech_stopped fires when VAD detects end of utterance —
    // this is when voice-session fetches intelligence context and calls
    // triggerResponse() after injecting it.
    if (type === 'input_audio_buffer.speech_stopped') {
      this.emit('speech_stopped');
    }

    if (type === 'conversation.item.input_audio_transcription.completed') {
      const transcript = (ev.transcript as string) ?? '';
      this.emit('transcript', transcript);
    }

    if (type === 'response.text.delta') {
      this.emit('text_delta', (ev.delta as string) ?? '');
    }

    if (type === 'response.done') {
      const response = ev.response as Record<string, unknown> | undefined;
      const usage = response?.usage as Record<string, number> | undefined;
      if (usage) {
        this.emit('usage', {
          inputTokens: usage.total_tokens ?? 0,
          outputTokens: usage.output_tokens ?? 0,
        });
      }
    }

    if (type === 'error') {
      const errObj = ev.error as Record<string, unknown> | undefined;
      this.emit('error', new Error((errObj?.message as string) ?? JSON.stringify(ev.error)));
    }

    if (type === 'session.created') this.emit('session_created');
    if (type === 'rate_limits.updated') this.emit('rate_limits', ev.rate_limits);
  }

  sendAudio(pcm: Buffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      type: 'input_audio_buffer.append',
      audio: pcm.toString('base64'),
    }));
  }

  sendText(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.firstAudioTime = 0;
    this.ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
    }));
    this.triggerResponse();
  }

  /**
   * Injects a system-level context message into the live Realtime session.
   * Called by voice-session after fetching per-turn intelligence hints from
   * llm-orchestrator's /intelligence-context endpoint — before triggerResponse().
   */
  injectContext(systemText: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !systemText.trim()) return;
    this.ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'system',
        content: [{ type: 'input_text', text: systemText }],
      },
    }));
  }

  /**
   * Manually triggers a Realtime response after context injection.
   * Must be called after injectContext() (or directly for text turns).
   */
  triggerResponse(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.firstAudioTime = 0;
    this.ws.send(JSON.stringify({ type: 'response.create' }));
  }

  cancel(): void {
    this.cancelled = true;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'response.cancel' }));
    }
  }

  close(): void {
    this.cancelled = true;
    this.clearPing();
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
    }
    this.ws = null;
  }

  private clearPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
