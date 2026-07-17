import { NextResponse, type NextRequest } from 'next/server';

import { handleRouteError } from '@/lib/route-handler';
import { backendRequest } from '@/lib/server-api-client';
import type { WorkflowExecution } from '@/lib/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const executions = await backendRequest<WorkflowExecution[]>(`/workflows/${params.id}/executions`);
    return NextResponse.json({ data: executions });
  } catch (error) {
    return handleRouteError(error);
  }
}
