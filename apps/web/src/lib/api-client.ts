import type { ApiErrorBody } from './types';

export class ClientApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly requestId: string,
  ) {
    super(message);
    this.name = 'ClientApiError';
  }
}

export async function clientRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');

  const response = await fetch(`/api${path}`, { ...init, headers, credentials: 'include' });
  const rawBody = await response.text();
  const parsedBody: unknown = rawBody ? JSON.parse(rawBody) : null;

  if (!response.ok) {
    const errorBody = parsedBody as ApiErrorBody | null;
    if (response.status === 401) {
      window.location.href = '/login';
      throw new ClientApiError('UNAUTHORIZED', 'Session expired. Please log in again.', 401, 'unknown');
    }
    if (response.status === 403) {
      throw new ClientApiError('FORBIDDEN', 'You do not have permission to perform this action.', 403, errorBody?.error.requestId ?? 'unknown');
    }
    throw new ClientApiError(
      errorBody?.error.code ?? 'UNKNOWN_ERROR',
      errorBody?.error.message ?? 'Something went wrong. Please try again.',
      response.status,
      errorBody?.error.requestId ?? 'unknown',
    );
  }

  return (parsedBody as { data: T }).data;
}
