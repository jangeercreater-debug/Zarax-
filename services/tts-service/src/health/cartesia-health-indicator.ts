/** Structural type matching the health indicator service object provided by the
 * observability HealthModule. Defined locally because @nestjs/terminus v10 (the
 * installed version) does not export a HealthIndicatorService type. */
type HealthCheckResult = Record<string, unknown>;
interface HealthIndicatorLike {
  check(key: string): {
    up: (data?: Record<string, unknown>) => HealthCheckResult;
    down: (data?: Record<string, unknown>) => HealthCheckResult;
  };
}

/** Same reasoning as stt-service's Deepgram indicator — configuration-presence check,
 * not a live round-trip synthesis call on every readiness poll. */
export function createCartesiaHealthIndicator(
  apiKey: string | undefined,
  healthIndicatorService: HealthIndicatorLike,
) {
  return async () => {
    const indicator = healthIndicatorService.check('cartesia');
    if (!apiKey) {
      return indicator.down({ message: 'CARTESIA_API_KEY is not configured.' });
    }
    return indicator.up();
  };
}
