# @zarax/resilience

Layer 2 — the single mechanism every outbound call to a third-party provider (Deepgram,
Cartesia, LiveKit, Claude, Groq, OpenAI, Gemini) goes through. Business logic and
controllers never touch retry/timeout/circuit-breaker/rate-limit concerns directly, and
provider adapters never leave a raw SDK call unwrapped — see docs/dependency-rules.md
and the project standard: "All outbound API calls must be wrapped inside provider
adapters; business logic must never call SDKs directly."

## Components

- **`withRetry`** — exponential backoff with full jitter, configurable max attempts and
  a retryable-error predicate.
- **`withTimeout`** — races a call against a timer; passes an `AbortSignal` through so
  `fetch`-based calls actually cancel in-flight, not just get abandoned.
- **`CircuitBreaker`** — closed/open/half-open state machine. Wraps the *whole* retried
  operation as one outcome (a transient failure that a retry recovers from doesn't trip
  it), so it only opens on genuinely sustained failure.
- **`TokenBucketRateLimiter`** — protects against exceeding a provider's own rate limits;
  gates every individual attempt, including retries.
- **`ProviderHealthMonitor`** — sliding-window success/failure tracking, feeding both a
  Terminus health indicator and `FallbackChain`'s "try healthy candidates first" ordering.
- **`ResilientClient`** — composes all of the above into one `.execute(fn)` call. This is
  what a provider adapter method calls internally.
- **`FallbackChain`** — tries an ordered list of `ResilientClient`-backed candidates,
  skipping already-unhealthy ones first, falling back to the next on failure.
- **`ResilientHttpClient`** — `ResilientClient` + automatic `x-request-id` correlation
  header propagation, for adapters built on `fetch` (e.g. Cartesia).

## Usage in a provider adapter

```ts
export class ClaudeProvider implements LLMProvider {
  private readonly resilientClient = new ResilientClient({
    providerName: 'anthropic',
    timeoutMs: 15_000,
    retry: { maxAttempts: 3, baseDelayMs: 300 },
    circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30_000 },
    rateLimiter: { capacity: 50, refillPerSecond: 10 },
    logger: this.logger,
  });

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    return this.resilientClient.execute(() => this.client.messages.create({ ... }));
  }
}
```

## Wiring health into `/ready`

```ts
HealthModule.forRoot({
  indicators: [createProviderHealthIndicator(claudeProvider.resilientClient.healthMonitor, healthIndicatorService)],
})
```
