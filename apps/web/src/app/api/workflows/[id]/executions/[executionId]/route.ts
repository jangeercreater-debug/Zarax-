import { NextResponse, type NextRequest } from 'next/server';

import { handleRouteError } from '@/lib/route-handler';
import { backendRequest } from '@/lib/server-api-client';
import type { WorkflowExecution } from '@/lib/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; executionId: string } },
): Promise<NextResponse> {
  try {
    const execution = await backendRequest<WorkflowExecution>(
      `/workflows/${params.id}/executions/${params.executionId}`,
    );
    return NextResponse.json({ data: execution });
  } catch (error) {
    return handleRouteError(error);
  }
}
