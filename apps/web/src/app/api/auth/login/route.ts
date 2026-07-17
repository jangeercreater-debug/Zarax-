import { NextResponse, type NextRequest } from 'next/server';

import { setAuthCookies } from '@/lib/auth-cookies';
import { handleRouteError } from '@/lib/route-handler';
import { backendRequest } from '@/lib/server-api-client';
import type { AuthTokens } from '@/lib/types';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { email: string; password: string };

    const tokens = await backendRequest<AuthTokens>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    setAuthCookies(tokens);

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    return handleRouteError(error);
  }
}
