// Tracing MUST be set up before any other import that should be auto-instrumented.
import { setupTracing } from '@zarax/shared-observability';

setupTracing({
  serviceName: 'api',
  otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
});

/* eslint-disable import/order -- these imports must follow the tracing setup above */
import 'reflect-metadata';
import helmet from 'helmet';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { GlobalExceptionFilter } from '@zarax/shared-errors';
import { correlationIdMiddleware, ZaraxLogger } from '@zarax/shared-logger';
import { applyApiVersioning, setupGracefulShutdown, setupOpenApi } from '@zarax/shared-observability';

import { AppModule } from './app.module';
/* eslint-enable import/order */

async function bootstrap(): Promise<void> {
  const logger = new ZaraxLogger({
    serviceName: 'api',
    level: process.env.LOG_LEVEL ?? 'info',
    pretty: process.env.NODE_ENV !== 'production',
  });

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(logger);

  app.use(correlationIdMiddleware);

  app.useGlobalFilters(new GlobalExceptionFilter(logger));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strips properties not declared in the DTO
      forbidNonWhitelisted: true, // rejects requests containing unknown properties
      transform: true, // auto-converts payloads to their DTO class instances
    }),
  );

  // Helmet — security headers (CSP disabled to avoid conflicts with API clients)
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

  // CORS — strict allowlist, never open to all origins
  const allowedOrigins = [
    process.env.DASHBOARD_URL,
    'https://zarax1.vercel.app',
    'https://zaraxweb-production.up.railway.app',
    'http://localhost:3000',
    'http://localhost:3100',
  ].filter((u): u is string => Boolean(u));
  app.enableCors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      if (!origin || allowedOrigins.some((u) => origin.startsWith(u))) cb(null, true);
      else cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id'],
  });

  // Production standards (see docs/production-standards.md): every route defaults to
  // /v1/... (health/metrics stay unversioned); OpenAPI docs auto-generate from the
  // existing DTO/controller decorators and are served at /docs.
  applyApiVersioning(app);
  setupOpenApi(app, {
    serviceName: 'ZaraX API',
    description: 'Core domain service — tenants, users/auth, agents.',
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  logger.log(`api listening on port ${port}`);

  setupGracefulShutdown(app, { logger });
}

void bootstrap();
