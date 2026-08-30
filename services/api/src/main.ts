// Tracing MUST be set up before any other import that should be auto-instrumented.
import { setupTracing } from '@zarax/shared-observability';

setupTracing({
  serviceName: 'api',
  otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
});

/* eslint-disable import/order -- these imports must follow the tracing setup above */
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { GlobalExceptionFilter } from '@zarax/shared-errors';
import { correlationIdMiddleware, ZaraxLogger } from '@zarax/shared-logger';
import { applyApiVersioning, setupGracefulShutdown, setupOpenApi } from '@zarax/shared-observability';

import { AppModule } from './app.module';
/* eslint-enable import/order */

const ALLOWED_ORIGINS = [
  'https://zaraxweb-production.up.railway.app',
  'https://zarax1.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
];

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
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Security: disable x-powered-by header
  app.getHttpAdapter().getInstance().disable('x-powered-by');

  // Increase JSON body limit for voice clone audio upload (max 5MB decoded = ~7MB base64)
  app.use(require('express').json({ limit: '10mb' }));
  app.use(require('express').urlencoded({ limit: '10mb', extended: true }));

  // CORS: restrict to known origins only
  app.enableCors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Internal-Token', 'X-Tenant-Id', 'X-User-Id', 'X-Correlation-Id'],
    maxAge: 86400,
  });

  applyApiVersioning(app);

  // Swagger: only expose in non-production environments
  if (process.env.NODE_ENV !== 'production') {
    setupOpenApi(app, {
      serviceName: 'ZaraX API',
      description: 'Core domain service — tenants, users/auth, agents.',
    });
    logger.log('Swagger docs enabled at /docs (non-production)');
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  logger.log(`api listening on port ${port}`);

  setupGracefulShutdown(app, { logger });
}

void bootstrap();
// Helmet enabled
