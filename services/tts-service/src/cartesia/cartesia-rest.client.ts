import { ResilientHttpClient } from '@zarax/resilience';
import { AppError, ExternalServiceError } from '@zarax/shared-errors';
import type { ZaraxLogger } from '@zarax/shared-logger';

const CARTESIA_BYTES_ENDPOINT = 'https://api.cartesia.ai/tts/bytes';
const DEFAULT_MODEL_ID = 'sonic-english';
const DEFAULT_SAMPLE_RATE = 24000;

export interface SynthesizeOptions {
  text: string;
  voiceId: string;
  modelId?: string;
}

export interface CartesiaRestClientOptions {
  apiKey: string;
  apiVersion: string;
  logger?: ZaraxLogger;
}

/**
 * Wraps Cartesia's `/tts/bytes` REST endpoint via ResilientHttpClient (retry/timeout/
 * circuit-breaker/rate-limit + automatic correlation-ID propagation) rather than an
 * SDK — the REST surface here is a single stable JSON-in/bytes-out call, and avoiding
 * an SDK dependency means one less third-party API surface to track for breaking
 * changes.
 */
export class CartesiaRestClient {
  private readonly httpClient: ResilientHttpClient;

  constructor(private readonly options: CartesiaRestClientOptions) {
    this.httpClient = new ResilientHttpClient({
      providerName: 'cartesia',
      timeoutMs: 15_000,
      retry: { maxAttempts: 3, baseDelayMs: 300, maxDelayMs: 3000 },
      circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30_000 },
      rateLimiter: { capacity: 20, refillPerSecond: 5 },
      logger: options.logger,
    });
  }

  get resilientClient(): ResilientHttpClient {
    return this.httpClient;
  }

  async synthesize(request: SynthesizeOptions): Promise<Buffer> {
    let response: Response;
    try {
      response = await this.httpClient.fetch(CARTESIA_BYTES_ENDPOINT, {
        method: 'POST',
        headers: {
          'X-API-Key': this.options.apiKey,
          'Cartesia-Version': this.options.apiVersion,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_id: request.modelId ?? DEFAULT_MODEL_ID,
          transcript: request.text,
          voice: { mode: 'id', id: request.voiceId },
          output_format: {
            container: 'wav',
            encoding: 'pcm_s16le',
            sample_rate: DEFAULT_SAMPLE_RATE,
          },
        }),
      });
    } catch (error) {
      // Errors already typed by the resilience layer (timeout/circuit-open/rate-limit)
      // carry their own meaning and must reach the caller unchanged; only a raw,
      // unexpected failure (network error, etc.) gets wrapped here.
      if (error instanceof AppError) throw error;
      throw new ExternalServiceError(
        'Cartesia',
        error instanceof Error ? error.message : 'Network request to Cartesia failed',
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new ExternalServiceError('Cartesia', `HTTP ${response.status}: ${body || response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
