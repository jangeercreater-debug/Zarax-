import type { Server as HttpServer } from 'node:http';

import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ResilientClient } from '@zarax/resilience';
import { APP_CONFIG, type AppConfigService } from '@zarax/shared-config';
import { runWithRequestContext, ZARAX_LOGGER, type ZaraxLogger } from '@zarax/shared-logger';
import { WebSocketServer, type WebSocket } from 'ws';

import type { SttServiceEnv } from '../config/env.schema';
import { DeepgramLiveSession } from '../deepgram/deepgram-live-session';

const TRANSCRIPTION_PATH = '/transcription';

/**
 * Client protocol (binary-first, minimal JSON control frames):
 *   Connect:    wss://.../transcription?token=<INTERNAL_SERVICE_TOKEN>&callId=<uuid>&correlationId=<uuid>
 *   Client → server: raw binary frames = linear16 PCM audio, 16kHz mono
 *   Server → client: JSON text frames = {"type":"transcript","text":"...","isFinal":bool,"confidence":number}
 *                     {"type":"error","message":"..."}
 *
 * `correlationId` (propagated from voice-gateway's call session, ultimately the same
 * ID that ties together the LiveKit webhook, tool-executor calls, and TTS synthesis
 * for one voice session) is bound into this connection's log context for its entire
 * lifetime — every log line emitted while handling this connection carries it,
 * without threading it through every method signature.
 */
@Injectable()
export class TranscriptionGatewayService implements OnModuleDestroy {
  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly activeSessions = new Set<DeepgramLiveSession>();
  /** Shared across every live session in this process — connection-establishment
   * circuit breaker/health state must persist across sessions to be meaningful (a
   * per-session breaker would never accumulate enough calls to trip). */
  private readonly liveConnectionResilientClient: ResilientClient;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfigService<SttServiceEnv>,
    @Inject(ZARAX_LOGGER) private readonly logger: ZaraxLogger,
  ) {
    this.liveConnectionResilientClient = new ResilientClient({
      providerName: 'deepgram-live',
      timeoutMs: 5000,
      retry: { maxAttempts: 2, baseDelayMs: 200 },
      circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30_000 },
      logger: this.logger,
    });
  }

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
      const correlationId = url.searchParams.get('correlationId') ?? callId;

      this.wss.handleUpgrade(request, socket, head, (ws) => {
        runWithRequestContext({ correlationId }, () => {
          void this.handleConnection(ws, callId);
        });
      });
    });
  }

  /** Closes every in-flight Deepgram session and the WS server itself — called by
   * Nest during graceful shutdown (see @zarax/shared-observability's
   * setupGracefulShutdown, which triggers this via app.close()). */
  onModuleDestroy(): void {
    for (const session of this.activeSessions) session.finish();
    this.wss.close();
  }

  private async handleConnection(ws: WebSocket, callId: string): Promise<void> {
    let session: DeepgramLiveSession;
    try {
      session = await DeepgramLiveSession.create(
        { apiKey: this.config.get('DEEPGRAM_API_KEY') },
        this.liveConnectionResilientClient,
      );
    } catch (error) {
      this.logger.error('Failed to open Deepgram live session', {
        callId,
        message: error instanceof Error ? error.message : String(error),
      });
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message: 'Could not start transcription session.' }));
        ws.close(1011, 'Upstream connection failed.');
      }
      return;
    }

    this.activeSessions.add(session);

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
      this.activeSessions.delete(session);
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
