import type { Server as HttpServer } from 'node:http';

import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ResilientClient } from '@zarax/resilience';
import { APP_CONFIG, type AppConfigService } from '@zarax/shared-config';
import { runWithRequestContext, ZARAX_LOGGER, type ZaraxLogger } from '@zarax/shared-logger';
import { WebSocketServer, type WebSocket } from 'ws';

import { CartesiaStreamSession } from '../cartesia/cartesia-stream.session';
import type { TtsServiceEnv } from '../config/env.schema';

const SYNTHESIS_PATH = '/synthesis';

interface SynthesisRequestMessage {
  text: string;
  voiceId: string;
  modelId?: string;
}

/**
 * Client protocol:
 *   Connect:          wss://.../synthesis?token=<INTERNAL_SERVICE_TOKEN>&correlationId=<uuid>
 *   Client → server:  one JSON text frame — {"text":"...","voiceId":"..."}
 *   Server → client:  binary frames = raw pcm_s16le audio chunks, then the socket closes
 *                      on completion; a JSON {"type":"error","message":"..."} frame on failure
 *
 * `correlationId` ties this synthesis call back to the same voice session that
 * originated the LiveKit call and the STT/LLM/tool-executor hops preceding it.
 */
@Injectable()
export class SynthesisGatewayService implements OnModuleDestroy {
  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly activeSessions = new Set<CartesiaStreamSession>();
  /** Shared across every stream session in this process — same reasoning as
   * stt-service's liveConnectionResilientClient: breaker/health state must persist
   * across sessions, not reset per-call. */
  private readonly streamConnectionResilientClient: ResilientClient;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfigService<TtsServiceEnv>,
    @Inject(ZARAX_LOGGER) private readonly logger: ZaraxLogger,
  ) {
    this.streamConnectionResilientClient = new ResilientClient({
      providerName: 'cartesia-stream',
      timeoutMs: 5000,
      retry: { maxAttempts: 2, baseDelayMs: 200 },
      circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30_000 },
      logger: this.logger,
    });
  }

  attachToServer(httpServer: HttpServer): void {
    httpServer.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url ?? '', 'http://internal');
      if (url.pathname !== SYNTHESIS_PATH) return;

      const token = url.searchParams.get('token');
      if (token !== this.config.get('INTERNAL_SERVICE_TOKEN')) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const correlationId = url.searchParams.get('correlationId') ?? undefined;

      this.wss.handleUpgrade(request, socket, head, (ws) => {
        if (correlationId) {
          runWithRequestContext({ correlationId }, () => {
            void this.handleConnection(ws);
          });
        } else {
          void this.handleConnection(ws);
        }
      });
    });
  }

  /** Called by Nest during graceful shutdown (setupGracefulShutdown → app.close()). */
  onModuleDestroy(): void {
    for (const session of this.activeSessions) session.close();
    this.wss.close();
  }

  private async handleConnection(ws: WebSocket): Promise<void> {
    const controlMessage = await this.waitForControlMessage(ws);
    if (!controlMessage) return; // Connection already closed with an appropriate code.

    let session: CartesiaStreamSession;
    try {
      session = await CartesiaStreamSession.create(
        {
          apiKey: this.config.get('CARTESIA_API_KEY'),
          apiVersion: this.config.get('CARTESIA_API_VERSION'),
          text: controlMessage.text,
          voiceId: controlMessage.voiceId,
          modelId: controlMessage.modelId,
        },
        this.streamConnectionResilientClient,
      );
    } catch (error) {
      this.logger.error('Failed to open Cartesia stream session', {
        message: error instanceof Error ? error.message : String(error),
      });
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message: 'Could not start synthesis session.' }));
        ws.close(1011, 'Upstream connection failed.');
      }
      return;
    }

    this.activeSessions.add(session);

    session.on('audio', (chunk) => {
      if (ws.readyState === ws.OPEN) ws.send(chunk, { binary: true });
    });

    session.on('done', () => {
      this.activeSessions.delete(session);
      if (ws.readyState === ws.OPEN) ws.close(1000, 'Synthesis complete.');
    });

    session.on('error', (error) => {
      this.logger.error('Cartesia streaming session error', { message: error.message });
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message: 'Synthesis upstream error.' }));
        ws.close(1011, 'Upstream synthesis error.');
      }
    });

    ws.on('close', () => {
      this.activeSessions.delete(session);
      session.close();
    });
    ws.on('error', (error) => {
      this.logger.error('Synthesis WebSocket error', { message: error.message });
      session.close();
    });
  }

  private waitForControlMessage(ws: WebSocket): Promise<SynthesisRequestMessage | undefined> {
    return new Promise((resolve) => {
      ws.once('message', (data, isBinary) => {
        if (isBinary) {
          ws.close(1003, 'Expected a JSON control message first.');
          resolve(undefined);
          return;
        }

        let request: SynthesisRequestMessage;
        try {
          request = JSON.parse(data.toString()) as SynthesisRequestMessage;
        } catch {
          ws.close(1003, 'Malformed JSON control message.');
          resolve(undefined);
          return;
        }

        if (!request.text || !request.voiceId) {
          ws.close(1003, "Both 'text' and 'voiceId' are required.");
          resolve(undefined);
          return;
        }

        resolve(request);
      });
    });
  }
}
