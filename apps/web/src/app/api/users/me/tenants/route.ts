import { NextResponse } from 'next/server';

import { handleRouteError } from '@/lib/route-handler';
import { backendRequest } from '@/lib/server-api-client';
import type { Membership } from '@/lib/types';

export async function GET(): Promise<NextResponse> {
  try {
    const memberships = await backendRequest<Membership[]>('/users/me/tenants');
    return NextResponse.json({ data: memberships });
  } catch (error) {
    return handleRouteError(error);
  }
}
