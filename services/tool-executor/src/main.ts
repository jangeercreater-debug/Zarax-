import { setupTracing } from '@zarax/shared-observability';

setupTracing({
  serviceName: 'tool-executor',
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
    serviceName: 'tool-executor',
    level: process.env.LOG_LEVEL ?? 'info',
    pretty: process.env.NODE_ENV !== 'production',
  });

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(logger);

  app.use(correlationIdMiddleware);
  app.useGlobalFilters(new GlobalExceptionFilter(logger));
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // No public API surface — this service is entirely event-bus-driven (see
  // ExecutionModule). The HTTP server that exists is only for /health, /ready,
  // and /metrics, from @zarax/shared-observability.
  const port = Number(process.env.PORT ?? 3004);
  await app.listen(port);
  logger.log(`tool-executor listening on port ${port} (event-bus consumer; no public API)`);

  setupGracefulShutdown(app, { logger });
}

void bootstrap();
