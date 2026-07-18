import { NextResponse, type NextRequest } from 'next/server';
import { handleRouteError } from '@/lib/route-handler';
import { backendRequest } from '@/lib/server-api-client';

export async function POST(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  try {
    const body = await request.text();
    const data = await backendRequest<unknown>(`/telephony/phone-numbers/${params.id}/assign`, { method: 'POST', body });
    return NextResponse.json({ data });
  } catch (error) { return handleRouteError(error); }
}
