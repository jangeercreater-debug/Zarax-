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
    const start = process.hrtime.bigint();
    // route.path is the templated path (e.g. /agents/:id), not the raw URL — keeps
    // cardinality bounded (real IDs would otherwise blow up the metric label set).
    const route = (request.route as { path?: string } | undefined)?.path ?? request.path;

    return next.handle().pipe(
      tap({
        next: () => this.record(request.method, route, response.statusCode, start),
        error: () => this.record(request.method, route, response.statusCode || 500, start),
      }),
    );
  }

  private record(method: string, route: string, statusCode: number, startNs: bigint): void {
    const durationSeconds = Number(process.hrtime.bigint() - startNs) / 1e9;
    const labels = { method, route, status_code: String(statusCode) };
    this.metrics.httpRequestsTotal.inc(labels);
    this.metrics.httpRequestDurationSeconds.observe(labels, durationSeconds);
  }
}
