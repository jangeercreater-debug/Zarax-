import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

import { ExternalServiceError } from '@zarax/shared-errors';
import WebSocket from 'ws';

const CARTESIA_WS_ENDPOINT = 'wss://api.cartesia.ai/tts/websocket';
const DEFAULT_MODEL_ID = 'sonic-english';
const DEFAULT_SAMPLE_RATE = 24000;

export interface CartesiaStreamOptions {
  apiKey: string;
  apiVersion: string;
  text: string;
  voiceId: string;
  modelId?: string;
}

export interface CartesiaStreamEvents {
  audio: [chunk: Buffer];
  done: [];
  error: [error: Error];
}

interface CartesiaWsMessage {
  type?: string;
  data?: string; // base64-encoded PCM audio chunk
  error?: string;
}

/**
 * One instance per synthesis request — opens a fresh WebSocket to Cartesia, streams the
 * full transcript as a single utterance (continue: false), and re-emits decoded audio
 * chunks as they arrive. Sentence-by-sentence incremental synthesis (feeding partial
 * LLM output as it streams) is a natural extension once llm-orchestrator exists to
 * drive it — this one-shot shape is what a single synthesis request needs today.
 */
export class CartesiaStreamSession extends EventEmitter {
  private readonly ws: WebSocket;

  constructor(options: CartesiaStreamOptions) {
    super();

    const url = `${CARTESIA_WS_ENDPOINT}?api_key=${encodeURIComponent(options.apiKey)}&cartesia_version=${encodeURIComponent(options.apiVersion)}`;
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      this.ws.send(
        JSON.stringify({
          context_id: randomUUID(),
          model_id: options.modelId ?? DEFAULT_MODEL_ID,
          transcript: options.text,
          voice: { mode: 'id', id: options.voiceId },
          output_format: {
            container: 'raw',
            encoding: 'pcm_s16le',
            sample_rate: DEFAULT_SAMPLE_RATE,
          },
          continue: false,
        }),
      );
    });

    this.ws.on('message', (raw) => {
      let message: CartesiaWsMessage;
      try {
        message = JSON.parse(raw.toString()) as CartesiaWsMessage;
      } catch {
        return; // Ignore any non-JSON frame rather than crashing the session.
      }

      if (message.error) {
        this.emit('error', new ExternalServiceError('Cartesia', message.error));
        return;
      }
      if (message.data) {
        this.emit('audio', Buffer.from(message.data, 'base64'));
      }
      if (message.type === 'done') {
        this.emit('done');
        this.ws.close();
      }
    });

    this.ws.on('error', (error) => {
      this.emit('error', new ExternalServiceError('Cartesia', error.message));
    });
  }

  close(): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.close();
  }
}

export declare interface CartesiaStreamSession {
  on<K extends keyof CartesiaStreamEvents>(
    event: K,
    listener: (...args: CartesiaStreamEvents[K]) => void,
  ): this;
  emit<K extends keyof CartesiaStreamEvents>(event: K, ...args: CartesiaStreamEvents[K]): boolean;
}
