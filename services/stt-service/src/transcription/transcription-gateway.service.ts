import type { Server as HttpServer } from 'node:http';

import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfigService } from '@zarax/shared-config';
import { ZARAX_LOGGER, type ZaraxLogger } from '@zarax/shared-logger';
import { WebSocketServer, type WebSocket } from 'ws';

import type { SttServiceEnv } from '../config/env.schema';
import { DeepgramLiveSession } from '../deepgram/deepgram-live-session';

const TRANSCRIPTION_PATH = '/transcription';

/**
 * Client protocol (binary-first, minimal JSON control frames):
 *   Connect:    wss://.../transcription?token=<INTERNAL_SERVICE_TOKEN>&callId=<uuid>
 *   Client → server: raw binary frames = linear16 PCM audio, 16kHz mono
 *   Server → client: JSON text frames = {"type":"transcript","text":"...","isFinal":bool,"confidence":number}
 *                     {"type":"error","message":"..."}
 */
@Injectable()
export class TranscriptionGatewayService {
  private readonly wss = new WebSocketServer({ noServer: true });

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfigService<SttServiceEnv>,
    @Inject(ZARAX_LOGGER) private readonly logger: ZaraxLogger,
  ) {}

  attachToServer(httpServer: HttpServer): void {
    httpServer.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url ?? '', 'http://internal');
      if (url.pathname !== TRANSCRIPTION_PATH) {
        return; // Let any other upgrade listener (or Nest itself) handle other paths.
      }

      const token = url.searchParams.get('token');
      if (token !== this.config.get('INTERNAL_SERVICE_TOKEN')) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const callId = url.searchParams.get('callId') ?? 'unknown';
      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.handleConnection(ws, callId);
      });
    });
  }

  private handleConnection(ws: WebSocket, callId: string): void {
    const session = new DeepgramLiveSession({
      apiKey: this.config.get('DEEPGRAM_API_KEY'),
    });

    session.on('transcript', (text, isFinal, confidence) => {
      if (ws.readyState !== ws.OPEN) return;
      ws.send(JSON.stringify({ type: 'transcript', text, isFinal, confidence }));
    });

    session.on('error', (error) => {
      this.logger.error('Deepgram session error', { callId, message: error.message });
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message: 'Transcription upstream error.' }));
      }
    });

    session.on('close', () => {
      if (ws.readyState === ws.OPEN) ws.close();
    });

    ws.on('message', (data, isBinary) => {
      if (!isBinary) return; // Ignore any stray non-audio text frames from the client.
      session.sendAudio(Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer));
    });

    ws.on('close', () => {
      session.finish();
    });

    ws.on('error', (error) => {
      this.logger.error('Transcription WebSocket error', { callId, message: error.message });
      session.finish();
    });
  }
}
