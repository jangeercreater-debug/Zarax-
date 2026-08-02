import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/route-handler";
import { backendRequest } from "@/lib/server-api-client";

export async function DELETE(): Promise<NextResponse> {
  try {
    const data = await backendRequest<unknown>("/tenants/me", { method: "DELETE" });
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
