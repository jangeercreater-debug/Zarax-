import type { HealthIndicatorService } from '@nestjs/terminus';

/** Same reasoning as stt-service's Deepgram indicator — configuration-presence check,
 * not a live round-trip synthesis call on every readiness poll. */
export function createCartesiaHealthIndicator(
  apiKey: string | undefined,
  healthIndicatorService: HealthIndicatorService,
) {
  return async () => {
    const indicator = healthIndicatorService.check('cartesia');
    if (!apiKey) {
      return indicator.down({ message: 'CARTESIA_API_KEY is not configured.' });
    }
    return indicator.up();
  };
}
