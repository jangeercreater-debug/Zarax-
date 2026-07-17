import { NextResponse, type NextRequest } from 'next/server';

import { handleRouteError } from '@/lib/route-handler';
import { backendRequest, RAG_SERVICE_URL } from '@/lib/server-api-client';
import type { KnowledgeBaseDocument } from '@/lib/types';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const search = request.nextUrl.searchParams;
    const query = new URLSearchParams();
    if (search.get('status')) query.set('status', search.get('status')!);
    if (search.get('sourceType')) query.set('sourceType', search.get('sourceType')!);
    const qs = query.toString();

    const documents = await backendRequest<KnowledgeBaseDocument[]>(
      `/documents${qs ? `?${qs}` : ''}`,
      {},
      RAG_SERVICE_URL,
    );
    return NextResponse.json({ data: documents });
  } catch (error) {
    return handleRouteError(error);
  }
}
