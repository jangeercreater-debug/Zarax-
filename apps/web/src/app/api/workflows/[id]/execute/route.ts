import { NextResponse, type NextRequest } from 'next/server';

import { handleRouteError } from '@/lib/route-handler';
import { backendRequest } from '@/lib/server-api-client';
import type { WorkflowExecution } from '@/lib/types';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const body = await request.text();
    const execution = await backendRequest<WorkflowExecution>(`/workflows/${params.id}/execute`, {
      method: 'POST',
      body: body || '{}',
    });
    return NextResponse.json({ data: execution });
  } catch (error) {
    return handleRouteError(error);
  }
}
