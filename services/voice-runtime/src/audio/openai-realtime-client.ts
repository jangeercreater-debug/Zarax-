import WebSocket from 'ws';
import { EventEmitter } from 'node:events';

export interface RealtimeOptions {
  apiKey: string;
  model: string;
  systemPrompt: string;
  voice: string;
  callId: string;
}

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
      // Keep-alive ping every 25 seconds
      this.pingInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.ping();
        }
      }, 25000);
    });

    this.ws.on('message', (data: Buffer) => {
      try {
        const ev = JSON.parse(data.toString()) as Record<string, unknown>;
        this.handleEvent(ev);
      } catch { /* ignore malformed */ }
    });

    this.ws.on('pong', () => {
      // Connection alive
    });

    this.ws.on('error', (err: Error) => { this.emit('error', err); });

    this.ws.on('close', (code: number) => {
      this.clearPing();
      if (!this.cancelled) {
        this.emit('done', code);
      }
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
          create_response: true,
        },
      },
    }));
    const setupLatency = Date.now() - this.connectTime;
    this.emit('ready', { setupLatencyMs: setupLatency });
  }

  private handleEvent(ev: Record<string, unknown>): void {
    const type = ev.type as string;

    if (type === 'response.audio.delta') {
      // Measure time to first audio
      if (this.firstAudioTime === 0) {
        this.firstAudioTime = Date.now();
        const firstResponseMs = this.firstAudioTime - this.connectTime;
        this.emit('latency', { firstResponseMs });
      }
      const delta = ev.delta as string;
      if (delta) this.emit('audio', Buffer.from(delta, 'base64'));
    }

    if (type === 'response.audio.done') {
      this.firstAudioTime = 0; // Reset for next response
      this.emit('speak_done');
    }

    if (type === 'input_audio_buffer.speech_started') {
      this.firstAudioTime = 0;
      this.emit('speech_started');
    }

    if (type === 'input_audio_buffer.speech_stopped') {
      this.emit('speech_stopped');
    }

    if (type === 'conversation.item.input_audio_transcription.completed') {
      this.emit('transcript', (ev.transcript as string) ?? '');
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
      this.emit('error', new Error(
        (errObj?.message as string) ?? JSON.stringify(ev.error)
      ));
    }

    if (type === 'session.created') {
      this.emit('session_created');
    }

    if (type === 'rate_limits.updated') {
      this.emit('rate_limits', ev.rate_limits);
    }
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
    this.ws.send(JSON.stringify({ type: 'response.create' }));
  }

  commitAudioBuffer(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
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
