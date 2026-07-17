import { NextResponse, type NextRequest } from 'next/server';

import { handleRouteError } from '@/lib/route-handler';
import { backendRequest } from '@/lib/server-api-client';
import type { Workflow } from '@/lib/types';

export async function GET(): Promise<NextResponse> {
  try {
    const workflows = await backendRequest<Workflow[]>('/workflows');
    return NextResponse.json({ data: workflows });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.text();
    const workflow = await backendRequest<Workflow>('/workflows', { method: 'POST', body });
    return NextResponse.json({ data: workflow }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
