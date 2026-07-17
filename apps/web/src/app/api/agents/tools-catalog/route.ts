import { NextResponse } from 'next/server';

import { handleRouteError } from '@/lib/route-handler';
import { backendRequest } from '@/lib/server-api-client';
import type { ToolCatalogEntry } from '@/lib/types';

export async function GET(): Promise<NextResponse> {
  try {
    const tools = await backendRequest<ToolCatalogEntry[]>('/agents/tools-catalog');
    return NextResponse.json({ data: tools });
  } catch (error) {
    return handleRouteError(error);
  }
}
