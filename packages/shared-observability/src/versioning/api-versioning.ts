import { VersioningType, type INestApplication } from '@nestjs/common';

export interface ApiVersioningOptions {
  defaultVersion?: string;
}

/**
 * Applies uniform URI versioning (`/v1/...`) across a service. Call once in main.ts,
 * before `app.listen()`:
 *   applyApiVersioning(app);
 *
 * `/health`, `/ready`, `/metrics` (from this same package's HealthModule/MetricsModule)
 * are already marked `@Controller({ version: VERSION_NEUTRAL })` and so stay reachable
 * at their fixed, unversioned paths regardless — orchestrators/monitoring expect them
 * there, not behind a version prefix.
 *
 * A future v2 controller opts in explicitly: `@Controller({ path: 'agents', version: '2' })`.
 */
export function applyApiVersioning(app: INestApplication, options: ApiVersioningOptions = {}): void {
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: options.defaultVersion ?? '1',
  });
}
