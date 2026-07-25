import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/route-handler";
import { backendRequest } from "@/lib/server-api-client";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const search = req.nextUrl.searchParams;
    const params = new URLSearchParams();
    for (const [k, v] of search.entries()) params.append(k, v);
    const qs = params.toString();
    const path = qs ? `/telephony/calls/search?${qs}` : "/telephony/calls";
    const data = await backendRequest<unknown>(path);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
