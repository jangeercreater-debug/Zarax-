export interface RetryOptions {
  /** Total attempts including the first — maxAttempts: 3 means up to 2 retries. */
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Multiplies the delay each attempt: attempt 1 waits baseDelayMs, attempt 2 waits
   * baseDelayMs * backoffFactor, etc. */
  backoffFactor?: number;
  /** Only errors this returns true for are retried — anything else rethrows
   * immediately. Defaults to retrying everything, since most callers wrap this with a
   * circuit breaker/timeout that already narrows what reaches here. */
  isRetryable?: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

const DEFAULTS: Required<Omit<RetryOptions, 'onRetry'>> = {
  maxAttempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 5000,
  backoffFactor: 2,
  isRetryable: () => true,
};

/** Full jitter (AWS's recommended strategy): a random delay between 0 and the
 * computed exponential value, rather than a fixed delay — this spreads out retries
 * from many concurrent callers instead of having them all retry in lockstep. */
function computeDelay(attempt: number, options: Required<Omit<RetryOptions, 'onRetry'>>): number {
  const exponential = options.baseDelayMs * options.backoffFactor ** (attempt - 1);
  const capped = Math.min(exponential, options.maxDelayMs);
  return Math.random() * capped;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const merged = { ...DEFAULTS, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= merged.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === merged.maxAttempts;
      if (isLastAttempt || !merged.isRetryable(error)) {
        throw error;
      }
      const delayMs = computeDelay(attempt, merged);
      options.onRetry?.(error, attempt, delayMs);
      await sleep(delayMs);
    }
  }

  // Unreachable in practice (the loop always returns or throws), but keeps the
  // function's return type sound without a non-null assertion.
  throw lastError;
}
