import { NextResponse } from 'next/server';

import { handleRouteError } from '@/lib/route-handler';
import { backendRequest } from '@/lib/server-api-client';
import type { AgentFeatureFlag } from '@/lib/types';

export async function GET(): Promise<NextResponse> {
  try {
    const flags = await backendRequest<AgentFeatureFlag[]>('/agents/feature-flags');
    return NextResponse.json({ data: flags });
  } catch (error) {
    return handleRouteError(error);
  }
}
