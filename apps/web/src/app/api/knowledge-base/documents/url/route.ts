import { NextResponse, type NextRequest } from 'next/server';

import { handleRouteError } from '@/lib/route-handler';
import { backendRequest, RAG_SERVICE_URL } from '@/lib/server-api-client';
import type { KnowledgeBaseDocument } from '@/lib/types';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.text();
    const document = await backendRequest<KnowledgeBaseDocument>(
      '/documents/url',
      { method: 'POST', body },
      RAG_SERVICE_URL,
    );
    return NextResponse.json({ data: document }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
