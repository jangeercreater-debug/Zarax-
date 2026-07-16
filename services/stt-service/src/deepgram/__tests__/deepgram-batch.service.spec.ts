import { AppConfigService } from '@zarax/shared-config';
import { ExternalServiceError } from '@zarax/shared-errors';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SttServiceEnv } from '../../config/env.schema';
import { DeepgramBatchService } from '../deepgram-batch.service';

const transcribeFileMock = vi.fn();

vi.mock('@deepgram/sdk', () => ({
  createClient: vi.fn(() => ({
    listen: { prerecorded: { transcribeFile: transcribeFileMock } },
  })),
}));

function buildConfig(): AppConfigService<SttServiceEnv> {
  return new AppConfigService({
    DEEPGRAM_API_KEY: 'test-key',
  } as SttServiceEnv);
}

describe('DeepgramBatchService', () => {
  beforeEach(() => {
    transcribeFileMock.mockReset();
  });

  it('returns the mapped transcript on success', async () => {
    transcribeFileMock.mockResolvedValue({
      result: {
        results: { channels: [{ alternatives: [{ transcript: 'hello world', confidence: 0.95 }] }] },
      },
      error: null,
    });

    const service = new DeepgramBatchService(buildConfig());
    const result = await service.transcribeFile(Buffer.from('fake-audio'), {
      mimetype: 'audio/wav',
    });

    expect(result).toEqual({ text: 'hello world', confidence: 0.95 });
    expect(transcribeFileMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ mimetype: 'audio/wav', model: 'nova-2' }),
    );
  });

  it('returns an empty result when Deepgram finds no speech', async () => {
    transcribeFileMock.mockResolvedValue({
      result: { results: { channels: [{ alternatives: [{ transcript: '' }] }] } },
      error: null,
    });

    const service = new DeepgramBatchService(buildConfig());
    const result = await service.transcribeFile(Buffer.from('silence'), { mimetype: 'audio/wav' });

    expect(result).toEqual({ text: '', confidence: 0 });
  });

  it('throws ExternalServiceError when Deepgram returns an error', async () => {
    transcribeFileMock.mockResolvedValue({ result: null, error: { message: 'quota exceeded' } });

    const service = new DeepgramBatchService(buildConfig());

    await expect(
      service.transcribeFile(Buffer.from('audio'), { mimetype: 'audio/wav' }),
    ).rejects.toThrow(ExternalServiceError);
  });
});
