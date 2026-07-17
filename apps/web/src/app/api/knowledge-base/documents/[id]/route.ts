import { NextResponse, type NextRequest } from 'next/server';

import { handleRouteError } from '@/lib/route-handler';
import { backendRequest, RAG_SERVICE_URL } from '@/lib/server-api-client';
import type { KnowledgeBaseDocument } from '@/lib/types';

interface RouteParams {
  params: { id: string };
}

export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const document = await backendRequest<KnowledgeBaseDocument>(
      `/documents/${params.id}`,
      {},
      RAG_SERVICE_URL,
    );
    return NextResponse.json({ data: document });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    await backendRequest<void>(`/documents/${params.id}`, { method: 'DELETE' }, RAG_SERVICE_URL);
    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    return handleRouteError(error);
  }
}
