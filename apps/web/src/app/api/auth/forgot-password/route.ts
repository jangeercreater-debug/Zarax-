import { NextResponse, type NextRequest } from 'next/server';

import { handleRouteError } from '@/lib/route-handler';
import { backendRequest } from '@/lib/server-api-client';

interface ForgotPasswordResponse {
  success: true;
  devOnlyResetLink?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.text();
    const result = await backendRequest<ForgotPasswordResponse>('/auth/forgot-password', {
      method: 'POST',
      body,
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
