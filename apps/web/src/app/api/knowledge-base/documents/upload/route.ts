import { NextResponse, type NextRequest } from 'next/server';

import { handleRouteError } from '@/lib/route-handler';
import { backendUploadRequest, RAG_SERVICE_URL } from '@/lib/server-api-client';
import type { KnowledgeBaseDocument } from '@/lib/types';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const incomingForm = await request.formData();
    const file = incomingForm.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'No file was uploaded.', requestId: 'unknown' } },
        { status: 400 },
      );
    }

    const forwardedForm = new FormData();
    forwardedForm.set('file', file, file.name);

    const document = await backendUploadRequest<KnowledgeBaseDocument>(
      '/documents/upload',
      forwardedForm,
      RAG_SERVICE_URL,
    );
    return NextResponse.json({ data: document }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
