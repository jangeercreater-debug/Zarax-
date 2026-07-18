import { ERROR_CODE_HTTP_STATUS, ErrorCode } from '@zarax/shared-types';

/**
 * Base class for every *expected, operational* error in the system — a validation
 * failure, a missing resource, an unauthorized request. These are conditions the
 * application anticipates and handles gracefully, as opposed to genuine bugs.
 *
 * `isOperational: true` is what the global exception filter uses to decide whether to
 * return the error's own message to the client, or mask it behind a generic
 * "internal error" (for unexpected exceptions, to avoid leaking internals).
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly httpStatus: number;
  public readonly isOperational = true;
  public readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.httpStatus = ERROR_CODE_HTTP_STATUS[code];
    if (details !== undefined) this.details = details;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ErrorCode.VALIDATION_FAILED, message, details);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Authentication is required to access this resource.') {
    super(ErrorCode.UNAUTHENTICATED, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action.') {
    super(ErrorCode.FORBIDDEN, message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    super(
      ErrorCode.NOT_FOUND,
      identifier ? `${resource} '${identifier}' was not found.` : `${resource} was not found.`,
    );
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ErrorCode.CONFLICT, message, details);
  }
}

export class RateLimitedError extends AppError {
  constructor(message = 'Too many requests. Please try again later.') {
    super(ErrorCode.RATE_LIMITED, message);
  }
}

export class TenantSuspendedError extends AppError {
  constructor(message = 'This tenant account is suspended.') {
    super(ErrorCode.TENANT_SUSPENDED, message);
  }
}

/** Wraps failures from third-party integrations (Deepgram, Cartesia, Claude, etc.). */
export class ExternalServiceError extends AppError {
  constructor(serviceName: string, message: string, details?: Record<string, unknown>) {
    super(ErrorCode.EXTERNAL_SERVICE_ERROR, `${serviceName}: ${message}`, details);
  }
}

export class DependencyUnavailableError extends AppError {
  constructor(dependencyName: string) {
    super(ErrorCode.DEPENDENCY_UNAVAILABLE, `${dependencyName} is currently unavailable.`);
  }
}

export class TimeoutError extends AppError {
  constructor(operationName: string, timeoutMs: number) {
    super(ErrorCode.TIMEOUT, `${operationName} timed out after ${timeoutMs}ms.`);
  }
}

/** Thrown when a call is rejected because its circuit breaker is currently open —
 * i.e. the upstream provider has been failing enough that we're deliberately not
 * calling it right now, to give it room to recover and to fail fast for callers. */
export class CircuitOpenError extends AppError {
  constructor(providerName: string) {
    super(
      ErrorCode.CIRCUIT_OPEN,
      `${providerName}'s circuit breaker is open (too many recent failures); not attempting the call.`,
    );
  }
}
