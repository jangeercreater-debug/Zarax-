import { NextResponse, type NextRequest } from 'next/server';
import { handleRouteError } from '@/lib/route-handler';
import { backendRequest } from '@/lib/server-api-client';

export async function GET(): Promise<NextResponse> {
  try {
    const data = await backendRequest<unknown>('/telephony/phone-numbers');
    return NextResponse.json({ data });
  } catch (error) { return handleRouteError(error); }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.text();
    const data = await backendRequest<unknown>('/telephony/phone-numbers', { method: 'POST', body });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) { return handleRouteError(error); }
}
