import { NextResponse } from 'next/server';

import { BackendApiError } from './server-api-client';

export function handleRouteError(error: unknown): NextResponse {
  if (error instanceof BackendApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, requestId: error.requestId, details: error.details } },
      { status: error.status },
    );
  }

  console.error('Unexpected error in Route Handler:', error);
  return NextResponse.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.', requestId: 'unknown' } },
    { status: 500 },
  );
}
