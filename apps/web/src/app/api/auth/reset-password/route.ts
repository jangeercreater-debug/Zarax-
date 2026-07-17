import { NextResponse, type NextRequest } from 'next/server';

import { handleRouteError } from '@/lib/route-handler';
import { backendRequest } from '@/lib/server-api-client';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.text();
    await backendRequest('/auth/reset-password', { method: 'POST', body });
    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    return handleRouteError(error);
  }
}
