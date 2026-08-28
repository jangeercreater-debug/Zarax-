import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/route-handler";
import { backendRequest } from "@/lib/server-api-client";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const data = await backendRequest<unknown>("/voices/" + params.id);
    return NextResponse.json(data);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const body = await req.json();
    const data = await backendRequest<unknown>("/voices/" + params.id, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    return NextResponse.json(data);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    await backendRequest<unknown>("/voices/" + params.id, { method: "DELETE" });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
