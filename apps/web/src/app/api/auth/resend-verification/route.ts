import { NextResponse } from 'next/server';

import { handleRouteError } from '@/lib/route-handler';
import { backendRequest } from '@/lib/server-api-client';

interface ResendVerificationResponse {
  success: true;
  devOnlyVerificationLink?: string;
}

export async function POST(): Promise<NextResponse> {
  try {
    const result = await backendRequest<ResendVerificationResponse>('/auth/resend-verification', {
      method: 'POST',
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
