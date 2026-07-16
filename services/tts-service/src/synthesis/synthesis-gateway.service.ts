import type { Server as HttpServer } from 'node:http';

import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfigService } from '@zarax/shared-config';
import { ZARAX_LOGGER, type ZaraxLogger } from '@zarax/shared-logger';
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
 *   Connect:          wss://.../synthesis?token=<INTERNAL_SERVICE_TOKEN>
 *   Client → server:  one JSON text frame — {"text":"...","voiceId":"..."}
 *   Server → client:  binary frames = raw pcm_s16le audio chunks, then the socket closes
 *                      on completion; a JSON {"type":"error","message":"..."} frame on failure
 */
@Injectable()
export class SynthesisGatewayService {
  private readonly wss = new WebSocketServer({ noServer: true });

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfigService<TtsServiceEnv>,
    @Inject(ZARAX_LOGGER) private readonly logger: ZaraxLogger,
  ) {}

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

      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.handleConnection(ws);
      });
    });
  }

  private handleConnection(ws: WebSocket): void {
    let session: CartesiaStreamSession | undefined;

    ws.once('message', (data, isBinary) => {
      if (isBinary) {
        ws.close(1003, 'Expected a JSON control message first.');
        return;
      }

      let request: SynthesisRequestMessage;
      try {
        request = JSON.parse(data.toString()) as SynthesisRequestMessage;
      } catch {
        ws.close(1003, 'Malformed JSON control message.');
        return;
      }

      if (!request.text || !request.voiceId) {
        ws.close(1003, "Both 'text' and 'voiceId' are required.");
        return;
      }

      session = new CartesiaStreamSession({
        apiKey: this.config.get('CARTESIA_API_KEY'),
        apiVersion: this.config.get('CARTESIA_API_VERSION'),
        text: request.text,
        voiceId: request.voiceId,
        modelId: request.modelId,
      });

      session.on('audio', (chunk) => {
        if (ws.readyState === ws.OPEN) ws.send(chunk, { binary: true });
      });

      session.on('done', () => {
        if (ws.readyState === ws.OPEN) ws.close(1000, 'Synthesis complete.');
      });

      session.on('error', (error) => {
        this.logger.error('Cartesia streaming session error', { message: error.message });
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: 'error', message: 'Synthesis upstream error.' }));
          ws.close(1011, 'Upstream synthesis error.');
        }
      });
    });

    ws.on('close', () => session?.close());
    ws.on('error', (error) => {
      this.logger.error('Synthesis WebSocket error', { message: error.message });
      session?.close();
    });
  }
}
