import { setupTracing } from '@zarax/shared-observability';

setupTracing({
  serviceName: 'stt-service',
  otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
});

/* eslint-disable import/order -- these imports must follow the tracing setup above */
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { GlobalExceptionFilter } from '@zarax/shared-errors';
import { correlationIdMiddleware, ZaraxLogger } from '@zarax/shared-logger';

import { AppModule } from './app.module';
import { TranscriptionGatewayService } from './transcription/transcription-gateway.service';
/* eslint-enable import/order */

async function bootstrap(): Promise<void> {
  const logger = new ZaraxLogger({
    serviceName: 'stt-service',
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

  // The raw WebSocket transcription endpoint attaches directly to the underlying HTTP
  // server's 'upgrade' event — this can only happen once that real http.Server exists,
  // i.e. after NestFactory.create() but before app.listen().
  const httpServer = app.getHttpServer();
  app.get(TranscriptionGatewayService).attachToServer(httpServer);

  const port = Number(process.env.PORT ?? 3002);
  await app.listen(port);
  logger.log(`stt-service listening on port ${port} (WS transcription endpoint at /transcription)`);
}

void bootstrap();
