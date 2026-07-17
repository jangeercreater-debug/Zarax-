import type { ApiErrorBody, AuthTokens } from './types';
import { getAccessToken, getRefreshToken, setAuthCookies } from './auth-cookies';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3000';

export class BackendApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly requestId: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'BackendApiError';
  }
}

async function rawFetch(path: string, init: RequestInit, accessToken?: string): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  // Every dashboard request is user-specific (tenant-scoped) — never cache at the
  // fetch layer; React Query on the client owns caching semantics instead.
  return fetch(`${BACKEND_URL}/v1${path}`, { ...init, headers, cache: 'no-store' });
}

async function tryRefreshAccessToken(refreshToken: string): Promise<AuthTokens | null> {
  const response = await rawFetch('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { data: AuthTokens };
  return body.data;
}

/**
 * Calls services/api on the caller's behalf. Never called from client components —
 * this is the one place that knows the backend's URL and reads the httpOnly token
 * cookie, exactly the isolation an httpOnly cookie is meant to provide.
 */
export async function backendRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const accessToken = getAccessToken();
  let response = await rawFetch(path, init, accessToken);

  if (response.status === 401) {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      const refreshed = await tryRefreshAccessToken(refreshToken);
      if (refreshed) {
        setAuthCookies(refreshed);
        response = await rawFetch(path, init, refreshed.accessToken);
      }
    }
  }

  const rawBody = await response.text();
  const parsedBody: unknown = rawBody ? JSON.parse(rawBody) : null;

  if (!response.ok) {
    const errorBody = parsedBody as ApiErrorBody | null;
    throw new BackendApiError(
      errorBody?.error.code ?? 'UNKNOWN_ERROR',
      errorBody?.error.message ?? 'The request failed.',
      response.status,
      errorBody?.error.requestId ?? 'unknown',
      errorBody?.error.details,
    );
  }

  // A 204 No Content (e.g. DELETE) has no body to unwrap — return undefined rather
  // than throwing on `null.data`.
  if (parsedBody === null) return undefined as T;

  return (parsedBody as { data: T }).data;
}
