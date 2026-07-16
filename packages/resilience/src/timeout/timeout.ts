import { TimeoutError } from '@zarax/shared-errors';

export interface TimeoutOptions {
  timeoutMs: number;
  operationName: string;
}

/**
 * `fn` receives an AbortSignal so calls built on `fetch` (or any AbortSignal-aware
 * client) can actually cancel the in-flight request when the timeout fires, instead of
 * merely abandoning it while it keeps running in the background.
 */
export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  options: TimeoutOptions,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    return await Promise.race([
      fn(controller.signal),
      new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new TimeoutError(options.operationName, options.timeoutMs));
        });
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
