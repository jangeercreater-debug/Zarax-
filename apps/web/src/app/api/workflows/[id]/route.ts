import { NextResponse, type NextRequest } from 'next/server';

import { handleRouteError } from '@/lib/route-handler';
import { backendRequest } from '@/lib/server-api-client';
import type { Workflow } from '@/lib/types';

interface RouteParams {
  params: { id: string };
}

export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const workflow = await backendRequest<Workflow>(`/workflows/${params.id}`);
    return NextResponse.json({ data: workflow });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const body = await request.text();
    const workflow = await backendRequest<Workflow>(`/workflows/${params.id}`, { method: 'PATCH', body });
    return NextResponse.json({ data: workflow });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    await backendRequest<void>(`/workflows/${params.id}`, { method: 'DELETE' });
    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    return handleRouteError(error);
  }
}
