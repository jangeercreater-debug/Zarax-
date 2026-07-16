export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface ApiSuccessResponse<T> {
  data: T;
  requestId: string;
}

/**
 * Result<T, E> gives internal service/domain code an explicit success/failure union
 * instead of throwing for expected, recoverable failure paths (reserve `throw` for
 * genuinely exceptional conditions handled by the global exception filter).
 */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
