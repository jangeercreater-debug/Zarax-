import { NextResponse, type NextRequest } from 'next/server';

import { handleRouteError } from '@/lib/route-handler';
import { backendRequest } from '@/lib/server-api-client';
import type { Agent } from '@/lib/types';

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const agent = await backendRequest<Agent>(`/agents/${params.id}/unpublish`, { method: 'POST' });
    return NextResponse.json({ data: agent });
  } catch (error) {
    return handleRouteError(error);
  }
}
