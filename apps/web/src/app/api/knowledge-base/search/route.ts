import { NextResponse, type NextRequest } from 'next/server';

import { handleRouteError } from '@/lib/route-handler';
import { backendRequest, RAG_SERVICE_URL } from '@/lib/server-api-client';
import type { KnowledgeBaseSearchResult } from '@/lib/types';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.text();
    const result = await backendRequest<{ results: KnowledgeBaseSearchResult[] }>(
      '/search',
      { method: 'POST', body },
      RAG_SERVICE_URL,
    );
    return NextResponse.json({ data: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
