/**
 * Structural type matching the shape of `HealthIndicatorService` from `@nestjs/terminus`.
 * The real `HealthIndicatorService` export only exists in `@nestjs/terminus@11+`; this
 * service pins to v10, which provides the same runtime shape via injection but no
 * exported type. Using a structural type keeps us decoupled from the version bump.
 */
interface HealthIndicatorServiceLike {
  check(key: string): {
    up(): Record<string, unknown>;
    down(opts: Record<string, unknown>): Record<string, unknown>;
  };
}

/**
 * A full round-trip health check against Deepgram would mean opening (and tearing
 * down) a live transcription socket on every /ready poll — wasteful and, at scale,
 * indistinguishable from abuse. Readiness here means "this instance is configured
 * correctly to reach Deepgram", not "Deepgram is currently up" (an outage there
 * should show up as elevated error rates/metrics, not this service's readiness).
 */
export function createDeepgramHealthIndicator(
  apiKey: string | undefined,
  healthIndicatorService: HealthIndicatorServiceLike,
) {
  return async () => {
    const indicator = healthIndicatorService.check('deepgram');
    if (!apiKey) {
      return indicator.down({ message: 'DEEPGRAM_API_KEY is not configured.' });
    }
    return indicator.up();
  };
}
