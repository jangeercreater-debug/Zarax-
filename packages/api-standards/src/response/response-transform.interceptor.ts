import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { getCorrelationId } from '@zarax/shared-logger';
import type { ApiSuccessResponse } from '@zarax/shared-types';
import { map } from 'rxjs';

/**
 * Applied globally (`app.useGlobalInterceptors(new ResponseTransformInterceptor())`).
 * Combined with `@zarax/shared-errors`' `GlobalExceptionFilter` (which already wraps
 * every error as `{ error: { code, message, requestId, details } }`), every response
 * from every service — success or failure — now shares one envelope shape with a
 * `requestId` for cross-referencing logs/traces.
 */
@Injectable()
export class ResponseTransformInterceptor<T> implements NestInterceptor<T, ApiSuccessResponse<T>> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): ReturnType<CallHandler<ApiSuccessResponse<T>>['handle']> {
    return next.handle().pipe(
      map((data) => ({
        data,
        requestId: getCorrelationId() ?? 'unknown',
      })),
    );
  }
}
