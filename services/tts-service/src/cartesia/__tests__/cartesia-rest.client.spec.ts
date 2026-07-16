import { ExternalServiceError } from '@zarax/shared-errors';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CartesiaRestClient } from '../cartesia-rest.client';

describe('CartesiaRestClient', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the response bytes as a Buffer on success', async () => {
    const fakeAudio = new Uint8Array([1, 2, 3, 4]).buffer;
    fetchMock.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => fakeAudio,
    });

    const client = new CartesiaRestClient({ apiKey: 'test-key', apiVersion: '2024-06-10' });
    const result = await client.synthesize({ text: 'hello', voiceId: 'voice-1' });

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result).toEqual(Buffer.from(fakeAudio));

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(requestInit.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      transcript: 'hello',
      voice: { mode: 'id', id: 'voice-1' },
      model_id: 'sonic-english',
    });
    expect((requestInit.headers as Record<string, string>)['X-API-Key']).toBe('test-key');
  });

  it('throws ExternalServiceError on a non-OK HTTP response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'invalid api key',
    });

    const client = new CartesiaRestClient({ apiKey: 'bad-key', apiVersion: '2024-06-10' });

    await expect(client.synthesize({ text: 'hello', voiceId: 'voice-1' })).rejects.toThrow(
      ExternalServiceError,
    );
  });

  it('throws ExternalServiceError when the network request itself fails', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    const client = new CartesiaRestClient({ apiKey: 'test-key', apiVersion: '2024-06-10' });

    await expect(client.synthesize({ text: 'hello', voiceId: 'voice-1' })).rejects.toThrow(
      ExternalServiceError,
    );
  });
});
