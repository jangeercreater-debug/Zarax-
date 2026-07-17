import { NextResponse } from 'next/server';

import { handleRouteError } from '@/lib/route-handler';
import { backendRequest } from '@/lib/server-api-client';
import type { Session } from '@/lib/types';

export async function GET(): Promise<NextResponse> {
  try {
    const sessions = await backendRequest<Session[]>('/users/me/sessions');
    return NextResponse.json({ data: sessions });
  } catch (error) {
    return handleRouteError(error);
  }
}
