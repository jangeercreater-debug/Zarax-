import { beforeEach, describe, expect, it, vi } from 'vitest';

const addMock = vi.fn();
const queueCloseMock = vi.fn();
const dlqAddMock = vi.fn();
const workerOnMock = vi.fn();
const workerCloseMock = vi.fn();

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation((name: string) => {
    if (name.endsWith(':dead-letter')) {
      return { add: dlqAddMock, close: vi.fn() };
    }
    return { add: addMock, close: queueCloseMock };
  }),
  Worker: vi.fn().mockImplementation(() => ({
    on: workerOnMock,
    close: workerCloseMock,
  })),
}));

vi.mock('@zarax/redis-client', () => ({
  createRedisClient: vi.fn(() => ({})),
}));

import { JobQueue } from '../job-queue';

describe('JobQueue', () => {
  beforeEach(() => {
    addMock.mockReset();
    dlqAddMock.mockReset();
    workerOnMock.mockReset();
  });

  it('adds a job with the configured retry/backoff options', async () => {
    const queue = new JobQueue({ name: 'test-queue', redisUrl: 'redis://localhost', attempts: 3, backoffDelayMs: 500 });
    await queue.add('do-thing', { foo: 'bar' });

    expect(addMock).toHaveBeenCalledWith(
      'do-thing',
      { foo: 'bar' },
      expect.objectContaining({ attempts: 3, backoff: { type: 'exponential', delay: 500 } }),
    );
  });

  it('registers a "failed" handler when process() is called', () => {
    const queue = new JobQueue({ name: 'test-queue', redisUrl: 'redis://localhost' });
    queue.process(async () => undefined);

    expect(workerOnMock).toHaveBeenCalledWith('failed', expect.any(Function));
  });

  it('moves a job to the dead-letter queue and invokes onDeadLetter when attempts are exhausted', async () => {
    const onDeadLetter = vi.fn();
    const queue = new JobQueue({
      name: 'test-queue',
      redisUrl: 'redis://localhost',
      onDeadLetter,
    });
    queue.process(async () => undefined);

    const failedHandler = workerOnMock.mock.calls.find(([event]) => event === 'failed')?.[1] as (
      job: unknown,
      error: Error,
    ) => Promise<void>;

    const fakeJob = { id: 'job-1', name: 'do-thing', data: { foo: 'bar' }, attemptsMade: 3, opts: { attempts: 3 } };
    await failedHandler(fakeJob, new Error('boom'));
    await new Promise((resolve) => setImmediate(resolve)); // flush the async .then() chain

    expect(dlqAddMock).toHaveBeenCalledWith(
      'do-thing',
      expect.objectContaining({ failureReason: 'boom', attemptsMade: 3 }),
    );
    expect(onDeadLetter).toHaveBeenCalled();
  });

  it('does not dead-letter a job that still has retries remaining', async () => {
    const onDeadLetter = vi.fn();
    const queue = new JobQueue({ name: 'test-queue', redisUrl: 'redis://localhost', onDeadLetter });
    queue.process(async () => undefined);

    const failedHandler = workerOnMock.mock.calls.find(([event]) => event === 'failed')?.[1] as (
      job: unknown,
      error: Error,
    ) => Promise<void>;

    const fakeJob = { id: 'job-1', name: 'do-thing', data: {}, attemptsMade: 1, opts: { attempts: 5 } };
    await failedHandler(fakeJob, new Error('transient'));

    expect(dlqAddMock).not.toHaveBeenCalled();
    expect(onDeadLetter).not.toHaveBeenCalled();
  });
});
