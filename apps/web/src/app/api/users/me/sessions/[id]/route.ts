import { NextResponse, type NextRequest } from 'next/server';

import { handleRouteError } from '@/lib/route-handler';
import { backendRequest } from '@/lib/server-api-client';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    await backendRequest(`/users/me/sessions/${params.id}`, { method: 'DELETE' });
    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    return handleRouteError(error);
  }
}
