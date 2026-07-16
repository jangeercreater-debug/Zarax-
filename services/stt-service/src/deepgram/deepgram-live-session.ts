import { EventEmitter } from 'node:events';

import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import type { ResilientClient } from '@zarax/resilience';
import { ExternalServiceError } from '@zarax/shared-errors';

import { mapTranscriptResult, type DeepgramResultsMessage } from './transcript-mapper';

export interface DeepgramSessionOptions {
  apiKey: string;
  model?: string;
  language?: string;
  sampleRate?: number;
}

export interface DeepgramSessionEvents {
  transcript: [text: string, isFinal: boolean, confidence: number];
  error: [error: Error];
  close: [];
}

const CONNECTION_TIMEOUT_MS = 5000;

/**
 * One instance per active WebSocket connection to this service — a live Deepgram
 * connection is inherently stateful and per-call, unlike the stateless HTTP layer
 * around it. The caller owns the instance's lifecycle (create on WS open, close on
 * WS close).
 *
 * Only *connection establishment* goes through the resilience layer (circuit breaker +
 * timeout, via the shared `resilientClient` every session for this process uses) —
 * retrying mid-stream doesn't make sense once audio frames have already been sent
 * into a session; a failure after the connection is open is instead surfaced via the
 * `error` event for the caller (TranscriptionGatewayService) to close the client
 * WebSocket and let it reconnect with a fresh session, same as any live media stream.
 */
export class DeepgramLiveSession extends EventEmitter {
  private readonly connection: ReturnType<ReturnType<typeof createClient>['listen']['live']>;
  private isOpen = false;

  private constructor(
    connection: ReturnType<ReturnType<typeof createClient>['listen']['live']>,
  ) {
    super();
    this.connection = connection;
    this.wireEvents();
  }

  static async create(
    options: DeepgramSessionOptions,
    resilientClient: ResilientClient,
  ): Promise<DeepgramLiveSession> {
    const connection = await resilientClient.execute(
      () =>
        new Promise<ReturnType<ReturnType<typeof createClient>['listen']['live']>>((resolve, reject) => {
          const deepgram = createClient(options.apiKey);
          const conn = deepgram.listen.live({
            model: options.model ?? 'nova-2',
            language: options.language ?? 'en-US',
            smart_format: true,
            interim_results: true,
            encoding: 'linear16',
            sample_rate: options.sampleRate ?? 16000,
            channels: 1,
          });

          const onOpen = (): void => {
            conn.off(LiveTranscriptionEvents.Error, onError);
            resolve(conn);
          };
          const onError = (error: unknown): void => {
            conn.off(LiveTranscriptionEvents.Open, onOpen);
            reject(
              new ExternalServiceError(
                'Deepgram',
                error instanceof Error ? error.message : 'Failed to open live session',
              ),
            );
          };

          conn.once(LiveTranscriptionEvents.Open, onOpen);
          conn.once(LiveTranscriptionEvents.Error, onError);
        }),
      'Deepgram.openLiveSession',
    );

    return new DeepgramLiveSession(connection);
  }

  private wireEvents(): void {
    this.isOpen = true;

    this.connection.on(LiveTranscriptionEvents.Transcript, (data: DeepgramResultsMessage) => {
      const chunk = mapTranscriptResult(data);
      if (chunk) this.emit('transcript', chunk.text, chunk.isFinal, chunk.confidence);
    });

    this.connection.on(LiveTranscriptionEvents.Error, (error: unknown) => {
      this.emit(
        'error',
        new ExternalServiceError('Deepgram', error instanceof Error ? error.message : 'Unknown error'),
      );
    });

    this.connection.on(LiveTranscriptionEvents.Close, () => {
      this.isOpen = false;
      this.emit('close');
    });
  }

  /** `chunk` must be raw linear16 PCM audio at the configured sample rate/channels —
   * the caller (transcription gateway) is responsible for that format contract. */
  sendAudio(chunk: Buffer): void {
    if (!this.isOpen) return; // Drop audio that arrives before Deepgram's socket is ready.
    this.connection.send(chunk);
  }

  /** Signals end-of-stream to Deepgram so it flushes any final transcript, then closes. */
  finish(): void {
    this.connection.requestClose();
  }
}

export declare interface DeepgramLiveSession {
  on<K extends keyof DeepgramSessionEvents>(
    event: K,
    listener: (...args: DeepgramSessionEvents[K]) => void,
  ): this;
  emit<K extends keyof DeepgramSessionEvents>(event: K, ...args: DeepgramSessionEvents[K]): boolean;
}
