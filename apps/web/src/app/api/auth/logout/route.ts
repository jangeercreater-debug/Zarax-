import { NextResponse } from 'next/server';

import { clearAuthCookies, getRefreshToken } from '@/lib/auth-cookies';
import { backendRequest } from '@/lib/server-api-client';

export async function POST(): Promise<NextResponse> {
  const refreshToken = getRefreshToken();

  if (refreshToken) {
    // Best-effort — an already-expired/invalid refresh token shouldn't block the user
    // from clearing their local cookies and landing back on the login page.
    await backendRequest('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
  }

  clearAuthCookies();
  return NextResponse.json({ data: { success: true } });
}
