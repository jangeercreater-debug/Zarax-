import { NextResponse, type NextRequest } from 'next/server';

import { handleRouteError } from '@/lib/route-handler';
import { backendRequest } from '@/lib/server-api-client';
import type { Agent } from '@/lib/types';

export async function GET(): Promise<NextResponse> {
  try {
    const agents = await backendRequest<Agent[]>('/agents');
    return NextResponse.json({ data: agents });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.text();
    const agent = await backendRequest<Agent>('/agents', { method: 'POST', body });
    return NextResponse.json({ data: agent }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
