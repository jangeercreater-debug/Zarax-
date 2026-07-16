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
import { setupGracefulShutdown } from '@zarax/shared-observability';

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

  app.enableCors({ origin: true, credentials: true });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  logger.log(`api listening on port ${port}`);

  setupGracefulShutdown(app, { logger });
}

void bootstrap();
