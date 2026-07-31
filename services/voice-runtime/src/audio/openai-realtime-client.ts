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

  constructor(private readonly opts: RealtimeOptions) {
    super();
  }

  connect(): void {
    const url = `wss://api.openai.com/v1/realtime?model=${this.opts.model}`;
    this.ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${this.opts.apiKey}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    });

    this.ws.on('open', () => { this.sendSessionUpdate(); });

    this.ws.on('message', (data: Buffer) => {
      try {
        const ev = JSON.parse(data.toString()) as Record<string, unknown>;
        this.handleEvent(ev);
      } catch { /* ignore */ }
    });

    this.ws.on('error', (err: Error) => { this.emit('error', err); });
    this.ws.on('close', () => { if (!this.cancelled) this.emit('done'); });
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
        },
      },
    }));
    this.emit('ready');
  }

  private handleEvent(ev: Record<string, unknown>): void {
    const type = ev.type as string;
    if (type === 'response.audio.delta') {
      const delta = ev.delta as string;
      if (delta) this.emit('audio', Buffer.from(delta, 'base64'));
    }
    if (type === 'response.audio.done') this.emit('speak_done');
    if (type === 'input_audio_buffer.speech_started') this.emit('speech_started');
    if (type === 'conversation.item.input_audio_transcription.completed') {
      this.emit('transcript', (ev.transcript as string) ?? '');
    }
    if (type === 'error') this.emit('error', new Error(JSON.stringify(ev.error)));
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
    this.ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
    }));
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
    this.ws?.close();
    this.ws = null;
  }
}
