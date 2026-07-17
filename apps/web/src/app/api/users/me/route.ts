import { NextResponse, type NextRequest } from 'next/server';

import { handleRouteError } from '@/lib/route-handler';
import { backendRequest } from '@/lib/server-api-client';
import type { Profile } from '@/lib/types';

export async function GET(): Promise<NextResponse> {
  try {
    const profile = await backendRequest<Profile>('/users/me');
    return NextResponse.json({ data: profile });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.text();
    const profile = await backendRequest<Profile>('/users/me', { method: 'PATCH', body });
    return NextResponse.json({ data: profile });
  } catch (error) {
    return handleRouteError(error);
  }
}
