import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/route-handler";
import { backendRequest } from "@/lib/server-api-client";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await params;
    const data = await backendRequest<unknown>("/api-keys/" + id, { method: "DELETE" });
    return NextResponse.json({ data });
  } catch (error) { return handleRouteError(error); }
}
