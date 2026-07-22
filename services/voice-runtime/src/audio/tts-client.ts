import WebSocket from 'ws';

type AudioHandler = (chunk: Buffer) => void;
type DoneHandler = () => void;
type ErrorHandler = (error: Error) => void;

export interface TtsClientOptions {
  ttsServiceUrl: string;
  internalToken: string;
  callId: string;
  voiceId?: string;
}

/** WebSocket client to tts-service — emits streaming PCM audio chunks. Cancellable for barge-in. */
export class TtsClient {
  private ws: WebSocket | null = null;
  private cancelled = false;
  private readonly audioHandlers: AudioHandler[] = [];
  private readonly doneHandlers: DoneHandler[] = [];
  private readonly errorHandlers: ErrorHandler[] = [];
  private pendingText: string | null = null;

  constructor(private readonly options: TtsClientOptions) {}

  onAudio(handler: AudioHandler): void { this.audioHandlers.push(handler); }
  onDone(handler: DoneHandler): void { this.doneHandlers.push(handler); }
  onError(handler: ErrorHandler): void { this.errorHandlers.push(handler); }

  connect(): void {
    const wsBase = this.options.ttsServiceUrl.replace(/^http/, 'ws').replace(/^https/, 'wss');
    const url = new URL('/synthesis', wsBase);
    url.searchParams.set('token', this.options.internalToken);
    url.searchParams.set('callId', this.options.callId);
    if (this.options.voiceId) url.searchParams.set('voiceId', this.options.voiceId);

    this.ws = new WebSocket(url.toString());

    this.ws.on('open', () => {
      const queued = this.pendingText;
      this.pendingText = null;
      if (queued !== null) this.synthesize(queued);
    });

    this.ws.on('message', (data: Buffer | string) => {
      if (this.cancelled) return;
      if (typeof data === 'string') {
        try {
          const msg = JSON.parse(data) as { type: string };
          if (msg.type === 'done') this.doneHandlers.forEach((h) => h());
        } catch { /* ignore */ }
      } else {
        this.audioHandlers.forEach((h) => h(data));
      }
    });

    this.ws.on('error', (error: Error) => this.errorHandlers.forEach((h) => h(error)));
    this.ws.on('close', () => { if (!this.cancelled) this.doneHandlers.forEach((h) => h()); });
  }

  synthesize(text: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      // tts-service expects exactly one control frame: { text, voiceId }. A separate
      // 'config' handshake is rejected and the socket closed with code 1003.
      this.ws.send(JSON.stringify({ text, voiceId: this.options.voiceId }));
      return;
    }
    // connect() returns before the upgrade completes, so callers routinely reach here
    // first. Dropping the text would leave the caller awaiting a 'done' that never comes.
    this.pendingText = text;
  }

  cancel(): void {
    this.cancelled = true;
    this.ws?.close();
    this.ws = null;
  }
}
