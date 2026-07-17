import { NextResponse } from 'next/server';

import { handleRouteError } from '@/lib/route-handler';
import { backendRequest } from '@/lib/server-api-client';
import type { Tenant } from '@/lib/types';

export async function GET(): Promise<NextResponse> {
  try {
    const tenant = await backendRequest<Tenant>('/tenants/me');
    return NextResponse.json({ data: tenant });
  } catch (error) {
    return handleRouteError(error);
  }
}
