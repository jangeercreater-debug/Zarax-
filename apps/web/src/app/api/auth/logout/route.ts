import { NextResponse } from 'next/server';

import { clearAuthCookies } from '@/lib/auth-cookies';

export async function POST(): Promise<NextResponse> {
  clearAuthCookies();
  return NextResponse.json({ data: { success: true } });
}
