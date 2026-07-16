import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
} from '@nestjs/common';
import { ErrorCode, type ApiErrorResponse } from '@zarax/shared-types';
import type { Request, Response } from 'express';

import { AppError } from '../errors/app-error';

/**
 * Deliberately NOT importing @zarax/shared-logger here — shared-errors and
 * shared-logger are both Layer 1 packages and must not depend on each other
 * sideways (see docs/dependency-rules.md). Any logger that structurally satisfies
 * this interface can be injected; shared-logger's implementation happens to.
 */
export interface ErrorFilterLogger {
  error(message: string, meta?: Record<string, unknown>): void;
}

export const ERROR_FILTER_LOGGER = Symbol('ERROR_FILTER_LOGGER');

const GENERIC_INTERNAL_MESSAGE = 'An unexpected error occurred. Please try again.';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    @Optional() @Inject(ERROR_FILTER_LOGGER) private readonly logger?: ErrorFilterLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request.headers['x-request-id'] as string | undefined) ?? 'unknown';

    const { httpStatus, body } = this.normalize(exception, requestId);

    if (!body.error.code || httpStatus >= 500) {
      // Only unexpected/5xx failures are logged as errors — expected 4xx operational
      // errors (validation, not-found, etc.) are normal traffic, not incidents.
      this.logger?.error(exception instanceof Error ? exception.message : 'Unknown exception', {
        requestId,
        path: request.url,
        stack: exception instanceof Error ? exception.stack : undefined,
      });
    }

    response.status(httpStatus).json(body);
  }

  private normalize(
    exception: unknown,
    requestId: string,
  ): { httpStatus: number; body: ApiErrorResponse } {
    if (exception instanceof AppError) {
      return {
        httpStatus: exception.httpStatus,
        body: {
          error: {
            code: exception.code,
            message: exception.message,
            requestId,
            details: exception.details,
          },
        },
      };
    }

    if (exception instanceof HttpException) {
      const httpStatus = exception.getStatus();
      const res = exception.getResponse();
      const message =
        typeof res === 'string' ? res : ((res as { message?: string }).message ?? exception.message);
      return {
        httpStatus,
        body: {
          error: {
            code: this.mapHttpStatusToCode(httpStatus),
            message: Array.isArray(message) ? message.join(', ') : message,
            requestId,
          },
        },
      };
    }

    // Unknown/unexpected error — never leak internals to the client.
    return {
      httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: GENERIC_INTERNAL_MESSAGE,
          requestId,
        },
      },
    };
  }

  private mapHttpStatusToCode(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.VALIDATION_FAILED;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHENTICATED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCode.CONFLICT;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.RATE_LIMITED;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }
}
