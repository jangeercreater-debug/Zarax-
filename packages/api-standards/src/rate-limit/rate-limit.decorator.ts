import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_METADATA_KEY = 'rate-limit:options';

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

/** Usage: `@RateLimit({ limit: 10, windowMs: 60_000 })` — overrides the guard's
 * service-wide default for this one route. */
export const RateLimit = (options: RateLimitOptions): MethodDecorator & ClassDecorator =>
  SetMetadata(RATE_LIMIT_METADATA_KEY, options);
