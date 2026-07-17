import type { ApiErrorBody, AuthTokens } from './types';
import { getAccessToken, getRefreshToken, setAuthCookies } from './auth-cookies';

/** The dashboard talks to two backend services until apps/gateway unifies them
 * behind one URL — services/api (auth, tenants, agents, users) and rag-service
 * (knowledge base). Every function here takes an explicit baseUrl (defaulting to
 * services/api, the original/primary target) rather than duplicating this whole
 * client per service. */
export const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3000';
export const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL ?? 'http://localhost:3005';

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

async function rawFetch(
  baseUrl: string,
  path: string,
  init: RequestInit,
  accessToken?: string,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  // Every dashboard request is user-specific (tenant-scoped) — never cache at the
  // fetch layer; React Query on the client owns caching semantics instead.
  return fetch(`${baseUrl}/v1${path}`, { ...init, headers, cache: 'no-store' });
}

async function tryRefreshAccessToken(refreshToken: string): Promise<AuthTokens | null> {
  // Auth/refresh always lives on services/api regardless of which service the
  // original request targeted.
  const response = await rawFetch(BACKEND_URL, '/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { data: AuthTokens };
  return body.data;
}

/**
 * Calls a backend service on the caller's behalf. Never called from client
 * components — this is the one place that knows each backend's URL and reads the
 * httpOnly token cookie, exactly the isolation an httpOnly cookie is meant to provide.
 */
export async function backendRequest<T>(
  path: string,
  init: RequestInit = {},
  baseUrl: string = BACKEND_URL,
): Promise<T> {
  const accessToken = getAccessToken();
  let response = await rawFetch(baseUrl, path, init, accessToken);

  if (response.status === 401) {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      const refreshed = await tryRefreshAccessToken(refreshToken);
      if (refreshed) {
        setAuthCookies(refreshed);
        response = await rawFetch(baseUrl, path, init, refreshed.accessToken);
      }
    }
  }

  return parseBackendResponse<T>(response);
}

/** Like backendRequest, but for multipart/form-data bodies (file uploads) — fetch
 * must set its own boundary-bearing Content-Type header, so this bypasses rawFetch's
 * `application/json` default rather than trying to layer multipart on top of it. */
export async function backendUploadRequest<T>(
  path: string,
  formData: FormData,
  baseUrl: string = BACKEND_URL,
): Promise<T> {
  const accessToken = getAccessToken();
  const headers = new Headers();
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  let response = await fetch(`${baseUrl}/v1${path}`, {
    method: 'POST',
    headers,
    body: formData,
    cache: 'no-store',
  });

  if (response.status === 401) {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      const refreshed = await tryRefreshAccessToken(refreshToken);
      if (refreshed) {
        setAuthCookies(refreshed);
        headers.set('Authorization', `Bearer ${refreshed.accessToken}`);
        response = await fetch(`${baseUrl}/v1${path}`, {
          method: 'POST',
          headers,
          body: formData,
          cache: 'no-store',
        });
      }
    }
  }

  return parseBackendResponse<T>(response);
}

async function parseBackendResponse<T>(response: Response): Promise<T> {
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
