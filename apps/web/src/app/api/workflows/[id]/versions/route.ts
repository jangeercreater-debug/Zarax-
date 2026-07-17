import { NextResponse, type NextRequest } from 'next/server';

import { handleRouteError } from '@/lib/route-handler';
import { backendRequest } from '@/lib/server-api-client';
import type { WorkflowVersion } from '@/lib/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const versions = await backendRequest<WorkflowVersion[]>(`/workflows/${params.id}/versions`);
    return NextResponse.json({ data: versions });
  } catch (error) {
    return handleRouteError(error);
  }
}
