import { NextResponse, type NextRequest } from 'next/server';

import { handleRouteError } from '@/lib/route-handler';
import { backendRequest } from '@/lib/server-api-client';

interface TestResult {
  response: string;
  shouldEndCall: boolean;
  endCallReason?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const body = await request.text();
    const result = await backendRequest<TestResult>(`/agents/${params.id}/test`, { method: 'POST', body });
    return NextResponse.json({ data: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
