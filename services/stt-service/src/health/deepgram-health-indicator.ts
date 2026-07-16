import type { HealthIndicatorService } from '@nestjs/terminus';

/**
 * A full round-trip health check against Deepgram would mean opening (and tearing
 * down) a live transcription socket on every /ready poll — wasteful and, at scale,
 * indistinguishable from abuse. Readiness here means "this instance is configured
 * correctly to reach Deepgram", not "Deepgram is currently up" (an outage there
 * should show up as elevated error rates/metrics, not this service's readiness).
 */
export function createDeepgramHealthIndicator(
  apiKey: string | undefined,
  healthIndicatorService: HealthIndicatorService,
) {
  return async () => {
    const indicator = healthIndicatorService.check('deepgram');
    if (!apiKey) {
      return indicator.down({ message: 'DEEPGRAM_API_KEY is not configured.' });
    }
    return indicator.up();
  };
}
