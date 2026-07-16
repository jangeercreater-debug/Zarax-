/**
 * Every AppError thrown by any service carries one of these codes. Clients (via
 * packages/sdk) can switch on `error.code` instead of parsing message strings.
 * Adding a new code here is additive and safe; renaming an existing one is a breaking
 * change and must go through a major SDK version bump.
 */
export enum ErrorCode {
  // 4xx — client/caller errors
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMITED = 'RATE_LIMITED',
  TENANT_SUSPENDED = 'TENANT_SUSPENDED',

  // 5xx — server/internal errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  DEPENDENCY_UNAVAILABLE = 'DEPENDENCY_UNAVAILABLE',
}

export const ERROR_CODE_HTTP_STATUS: Record<ErrorCode, number> = {
  [ErrorCode.VALIDATION_FAILED]: 400,
  [ErrorCode.UNAUTHENTICATED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.RATE_LIMITED]: 429,
  [ErrorCode.TENANT_SUSPENDED]: 403,
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.EXTERNAL_SERVICE_ERROR]: 502,
  [ErrorCode.DEPENDENCY_UNAVAILABLE]: 503,
};

/**
 * The wire shape of every error response returned by the gateway. Stable across all
 * services so the SDK has exactly one error shape to parse.
 */
export interface ApiErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
  };
}
