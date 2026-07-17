import { setupTracing } from '@zarax/shared-observability';

setupTracing({
  serviceName: 'rag-service',
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

async function bootstrap(): Promise<void> {
  const logger = new ZaraxLogger({
    serviceName: 'rag-service',
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
  app.enableCors({ origin: true, credentials: true });

  applyApiVersioning(app);
  setupOpenApi(app, {
    serviceName: 'ZaraX RAG Service',
    description: 'Knowledge base ingestion (PDF/DOCX/TXT/URL) and semantic search.',
  });

  const port = Number(process.env.PORT ?? 3005);
  await app.listen(port);
  logger.log(`rag-service listening on port ${port}`);

  setupGracefulShutdown(app, { logger });
}

void bootstrap();
