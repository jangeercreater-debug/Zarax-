import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { GlobalExceptionFilter } from '@zarax/shared-errors';
import { correlationIdMiddleware, ZaraxLogger } from '@zarax/shared-logger';
import { setupGracefulShutdown } from '@zarax/shared-observability';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const logger = new ZaraxLogger({
    serviceName: 'voice-runtime',
    level: process.env.LOG_LEVEL ?? 'info',
    pretty: process.env.NODE_ENV !== 'production',
  });

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(logger);
  app.use(correlationIdMiddleware);
  app.useGlobalFilters(new GlobalExceptionFilter(logger));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // voice-runtime has no tenant-facing HTTP surface — only /health, /ready, /metrics.
  const port = Number(process.env.PORT ?? 3008);
  await app.listen(port);
  logger.log(`voice-runtime listening on port ${port}`);

  setupGracefulShutdown(app, { logger });
}

void bootstrap();
