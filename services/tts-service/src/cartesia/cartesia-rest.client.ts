import { ExternalServiceError } from '@zarax/shared-errors';

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
}

/**
 * Wraps Cartesia's `/tts/bytes` REST endpoint directly via `fetch` rather than an SDK —
 * the REST surface here is a single stable JSON-in/bytes-out call, and avoiding an SDK
 * dependency means one less third-party API surface to track for breaking changes.
 */
export class CartesiaRestClient {
  constructor(private readonly options: CartesiaRestClientOptions) {}

  async synthesize(request: SynthesizeOptions): Promise<Buffer> {
    let response: Response;
    try {
      response = await fetch(CARTESIA_BYTES_ENDPOINT, {
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
