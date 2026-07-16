import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { InternalTokenGuard, INTERNAL_SERVICE_TOKEN } from '@zarax/shared-auth';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { CARTESIA_REST_CLIENT } from '../synthesis.module';
import { SynthesisController } from '../synthesis.controller';

describe('SynthesisController', () => {
  let app: INestApplication;
  const synthesizeMock = vi.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SynthesisController],
      providers: [
        { provide: CARTESIA_REST_CLIENT, useValue: { synthesize: synthesizeMock } },
        { provide: INTERNAL_SERVICE_TOKEN, useValue: 'expected-shared-secret' },
        InternalTokenGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a request without the internal token', async () => {
    await request(app.getHttpServer())
      .post('/synthesize')
      .send({ text: 'hello', voiceId: 'voice-1' })
      .expect(401);
  });

  it('returns synthesized audio bytes when the token is correct', async () => {
    synthesizeMock.mockResolvedValue(Buffer.from([1, 2, 3]));

    const response = await request(app.getHttpServer())
      .post('/synthesize')
      .set('x-internal-token', 'expected-shared-secret')
      .send({ text: 'hello', voiceId: 'voice-1' })
      .expect(201);

    expect(response.headers['content-type']).toContain('audio/wav');
    expect(synthesizeMock).toHaveBeenCalledWith({ text: 'hello', voiceId: 'voice-1', modelId: undefined });
  });
});
