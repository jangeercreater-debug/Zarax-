import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/route-handler";
import { backendRequest } from "@/lib/server-api-client";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const body = await req.json().catch(() => ({}));
    const data = await backendRequest<unknown>("/voices/" + params.id + "/preview", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return NextResponse.json(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
