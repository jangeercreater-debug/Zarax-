import { NextResponse, type NextRequest } from 'next/server';

import { handleRouteError } from '@/lib/route-handler';
import { backendRequest } from '@/lib/server-api-client';
import type { Agent } from '@/lib/types';

interface RouteParams {
  params: { id: string };
}

export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const agent = await backendRequest<Agent>(`/agents/${params.id}`);
    return NextResponse.json({ data: agent });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const body = await request.text();
    const agent = await backendRequest<Agent>(`/agents/${params.id}`, { method: 'PATCH', body });
    return NextResponse.json({ data: agent });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    await backendRequest<void>(`/agents/${params.id}`, { method: 'DELETE' });
    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    return handleRouteError(error);
  }
}
