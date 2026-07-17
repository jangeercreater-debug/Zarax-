/* eslint-disable import/order -- these imports must follow the tracing setup above */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { GlobalExceptionFilter } from '@zarax/shared-errors';
import { correlationIdMiddleware, ZaraxLogger } from '@zarax/shared-logger';
import { setupGracefulShutdown } from '@zarax/shared-observability';

import { AppModule } from './app.module';
/* eslint-enable import/order */

async function bootstrap(): Promise<void> {
  const logger = new ZaraxLogger({
    serviceName: 'workflow-engine',
    level: process.env.LOG_LEVEL ?? 'info',
    pretty: process.env.NODE_ENV !== 'production',
  });

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(logger);

  app.use(correlationIdMiddleware);
  app.useGlobalFilters(new GlobalExceptionFilter(logger));

  // No versioning/OpenAPI here — this service has no tenant-facing HTTP endpoints,
  // only /health, /ready, /metrics (see app.module.ts's comment on why there's no
  // AuthModule either). ExecutionModule's WorkflowExecutionConsumer starts consuming
  // jobs as soon as it's constructed (its constructor calls queue.process()) — no
  // separate "start the worker" step needed.
  const port = Number(process.env.PORT ?? 3007);
  await app.listen(port);
  logger.log(`workflow-engine listening on port ${port}`);

  setupGracefulShutdown(app, { logger });
}

void bootstrap();
