import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export interface OpenApiOptions {
  serviceName: string;
  description: string;
  version?: string;
  /** Path the docs UI is served at. Defaults to 'docs' (i.e. /docs). */
  path?: string;
  /** Bearer JWT auth scheme is added by default (most services use it); pass false to
   * omit if a service authenticates purely via API key / internal token instead. */
  includeBearerAuth?: boolean;
}

/**
 * Call once in main.ts, after the app is created but before `app.listen()`:
 *   setupOpenApi(app, { serviceName: 'ZaraX API', description: '...' });
 *
 * Generates the spec from whatever `@ApiProperty()`/`@ApiTags()`/etc. decorators exist
 * on controllers and DTOs — it does not require hand-written OpenAPI YAML/JSON, and
 * stays in sync with the code automatically as those decorators are added/changed.
 */
export function setupOpenApi(app: INestApplication, options: OpenApiOptions): void {
  const builder = new DocumentBuilder()
    .setTitle(options.serviceName)
    .setDescription(options.description)
    .setVersion(options.version ?? '1.0');

  if (options.includeBearerAuth ?? true) {
    builder.addBearerAuth();
  }

  const document = SwaggerModule.createDocument(app, builder.build());
  SwaggerModule.setup(options.path ?? 'docs', app, document);
}
