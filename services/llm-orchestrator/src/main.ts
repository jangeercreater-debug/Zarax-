import { setupTracing } from '@zarax/shared-observability';

setupTracing({
  serviceName: 'llm-orchestrator',
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
    serviceName: 'llm-orchestrator',
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

  const port = Number(process.env.PORT ?? 3006);
  await app.listen(port);
  logger.log(`llm-orchestrator listening on port ${port}`);

  setupGracefulShutdown(app, { logger });
}

void bootstrap();
