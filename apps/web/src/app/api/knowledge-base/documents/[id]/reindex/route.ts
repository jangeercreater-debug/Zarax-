import { NextResponse, type NextRequest } from 'next/server';

import { handleRouteError } from '@/lib/route-handler';
import { backendRequest, RAG_SERVICE_URL } from '@/lib/server-api-client';
import type { KnowledgeBaseDocument } from '@/lib/types';

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const document = await backendRequest<KnowledgeBaseDocument>(
      `/documents/${params.id}/reindex`,
      { method: 'POST' },
      RAG_SERVICE_URL,
    );
    return NextResponse.json({ data: document });
  } catch (error) {
    return handleRouteError(error);
  }
}
