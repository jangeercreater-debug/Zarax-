import { cookies } from 'next/headers';

const ACCESS_TOKEN_COOKIE = 'zarax_access_token';
const REFRESH_TOKEN_COOKIE = 'zarax_refresh_token';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

export function setAuthCookies(tokens: { accessToken: string; refreshToken: string }): void {
  const store = cookies();
  // Access token TTL matches the backend's JWT_ACCESS_TTL (15m default) — the cookie
  // itself doesn't need a matching maxAge since it's re-issued on every login/refresh,
  // but capping it means a stale cookie left in a shared browser profile expires too.
  store.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, { ...COOKIE_OPTIONS, maxAge: 60 * 15 });
  store.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, { ...COOKIE_OPTIONS, maxAge: 60 * 60 * 24 * 30 });
}

export function getAccessToken(): string | undefined {
  return cookies().get(ACCESS_TOKEN_COOKIE)?.value;
}

export function getRefreshToken(): string | undefined {
  return cookies().get(REFRESH_TOKEN_COOKIE)?.value;
}

export function clearAuthCookies(): void {
  const store = cookies();
  store.delete(ACCESS_TOKEN_COOKIE);
  store.delete(REFRESH_TOKEN_COOKIE);
}
