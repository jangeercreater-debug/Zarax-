import WebSocket, { type RawData } from 'ws';

type AudioHandler = (chunk: Buffer) => void;
type DoneHandler = () => void;
type ErrorHandler = (error: Error) => void;

export interface TtsClientOptions {
  ttsServiceUrl: string;
  internalToken: string;
  callId: string;
  voiceId?: string;
}

export class TtsClient {
  private ws: WebSocket | null = null;
  private cancelled = false;
  private pendingText: string | null = null;
  private readonly audioHandlers: AudioHandler[] = [];
  private readonly doneHandlers: DoneHandler[] = [];
  private readonly errorHandlers: ErrorHandler[] = [];

  constructor(private readonly options: TtsClientOptions) {}

  onAudio(handler: AudioHandler): void { this.audioHandlers.push(handler); }
  onDone(handler: DoneHandler): void { this.doneHandlers.push(handler); }
  onError(handler: ErrorHandler): void { this.errorHandlers.push(handler); }

  connect(): void {
    const wsBase = this.options.ttsServiceUrl.replace(/^http/, 'ws').replace(/^https/, 'wss');
    const url = new URL('/synthesis', wsBase);
    url.searchParams.set('token', this.options.internalToken);
    url.searchParams.set('correlationId', this.options.callId);

    this.ws = new WebSocket(url.toString());

    this.ws.on('open', () => {
      if (this.pendingText !== null) this.sendControlFrame(this.pendingText);
    });

    this.ws.on('message', (data: RawData, isBinary: boolean) => {
      if (this.cancelled) return;

      if (isBinary) {
        const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        this.audioHandlers.forEach((h) => h(chunk));
        return;
      }

      try {
        const msg = JSON.parse(data.toString()) as { type?: string; message?: string };
        if (msg.type === 'error') {
          this.errorHandlers.forEach((h) => h(new Error(msg.message || 'tts-service reported a synthesis error')));
        }
      } catch (e) {
        /* ignore malformed/unexpected text frames */
      }
    });

    this.ws.on('error', (error: Error) => this.errorHandlers.forEach((h) => h(error)));

    this.ws.on('close', (code: number, reason: Buffer) => {
      if (this.cancelled) return;
      if (code === 1000) {
        this.doneHandlers.forEach((h) => h());
      } else {
        const reasonText = reason.toString() || 'no reason given';
        this.errorHandlers.forEach((h) => h(new Error('tts-service closed connection (code ' + code + '): ' + reasonText)));
      }
    });
  }

  synthesize(text: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendControlFrame(text);
    } else {
      this.pendingText = text;
    }
  }

  private sendControlFrame(text: string): void {
    if (this.ws) {
      this.ws.send(JSON.stringify({ text: text, voiceId: this.options.voiceId }));
    }
    this.pendingText = null;
  }

  cancel(): void {
    this.cancelled = true;
    if (this.ws) this.ws.close();
    this.ws = null;
  }
}
