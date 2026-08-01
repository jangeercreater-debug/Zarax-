import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/route-handler";
import { backendRequest } from "@/lib/server-api-client";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const qs = req.nextUrl.searchParams.toString();
    const data = await backendRequest<unknown>("/analytics/trends" + (qs ? "?" + qs : ""));
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
