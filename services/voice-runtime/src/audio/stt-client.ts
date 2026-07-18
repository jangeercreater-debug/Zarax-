import WebSocket from 'ws';

export interface SttTranscriptEvent {
  type: 'transcript';
  text: string;
  isFinal: boolean;
  confidence: number;
}

export interface SttVadEvent {
  type: 'speech_started' | 'utterance_end';
}

export type SttEvent = SttTranscriptEvent | SttVadEvent;

type SttEventHandler = (event: SttEvent) => void;
type SttErrorHandler = (error: Error) => void;

export interface SttClientOptions {
  sttServiceUrl: string;
  internalToken: string;
  callId: string;
  sttModel?: string;
}

/** Wraps the stt-service WebSocket — emits STT events and VAD signals. */
export class SttClient {
  private ws: WebSocket | null = null;
  private closed = false;
  private readonly eventHandlers: SttEventHandler[] = [];
  private readonly errorHandlers: SttErrorHandler[] = [];

  constructor(private readonly options: SttClientOptions) {}

  onEvent(handler: SttEventHandler): void { this.eventHandlers.push(handler); }
  onError(handler: SttErrorHandler): void { this.errorHandlers.push(handler); }

  connect(): void {
    if (this.closed) return;
    const wsBase = this.options.sttServiceUrl.replace(/^http/, 'ws').replace(/^https/, 'wss');
    const url = new URL('/transcription', wsBase);
    url.searchParams.set('token', this.options.internalToken);
    url.searchParams.set('callId', this.options.callId);
    url.searchParams.set('correlationId', this.options.callId);
    if (this.options.sttModel) url.searchParams.set('model', this.options.sttModel);

    this.ws = new WebSocket(url.toString());

    this.ws.on('message', (data: Buffer) => {
      try {
        const event = JSON.parse(data.toString()) as SttEvent;
        this.eventHandlers.forEach((h) => h(event));
      } catch { /* Non-JSON frame */ }
    });

    this.ws.on('error', (error: Error) => this.errorHandlers.forEach((h) => h(error)));

    this.ws.on('close', () => {
      if (!this.closed) {
        setTimeout(() => this.connect(), 1000); // single reconnect attempt
      }
    });
  }

  sendAudio(pcm: Buffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(pcm);
    }
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
  }
}
