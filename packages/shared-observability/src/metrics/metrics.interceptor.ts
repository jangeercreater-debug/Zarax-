import {
  Inject,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { tap } from 'rxjs';

import { METRICS_REGISTRY } from './metrics.module';
import type { MetricsRegistry } from './metrics.registry';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(@Inject(METRICS_REGISTRY) private readonly metrics: MetricsRegistry) {}

  intercept(context: ExecutionContext, next: CallHandler): ReturnType<CallHandler['handle']> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const duration = (Date.now() - start) / 1000;
        const labels = {
          method: request.method,
          route: request.route?.path ?? request.path,
          status_code: String(response.statusCode),
        };
        this.metrics.httpRequestsTotal.inc(labels);
        this.metrics.httpRequestDurationSeconds.observe(labels, duration);
      }),
    );
  }
}
