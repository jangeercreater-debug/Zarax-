import { NextResponse, type NextRequest } from 'next/server';

import { handleRouteError } from '@/lib/route-handler';
import { backendRequest } from '@/lib/server-api-client';
import type { Workflow } from '@/lib/types';

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const workflow = await backendRequest<Workflow>(`/workflows/${params.id}/unpublish`, { method: 'POST' });
    return NextResponse.json({ data: workflow });
  } catch (error) {
    return handleRouteError(error);
  }
}
