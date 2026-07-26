import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/route-handler";
import { backendRequest } from "@/lib/server-api-client";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body = await req.json() as unknown;
    const data = await backendRequest<unknown>("/team/members/" + id + "/role", { method: "POST", body: JSON.stringify(body) });
    return NextResponse.json({ data });
  } catch (error) { return handleRouteError(error); }
}
