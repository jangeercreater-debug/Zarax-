import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/route-handler";
import { backendRequest } from "@/lib/server-api-client";

export async function GET(): Promise<NextResponse> {
  try {
    const data = await backendRequest<unknown>("/api-keys");
    return NextResponse.json({ data });
  } catch (error) { return handleRouteError(error); }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as unknown;
    const data = await backendRequest<unknown>("/api-keys", { method: "POST", body: JSON.stringify(body) });
    return NextResponse.json({ data });
  } catch (error) { return handleRouteError(error); }
}
