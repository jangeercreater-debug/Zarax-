import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/route-handler";
import { backendRequest } from "@/lib/server-api-client";

export async function GET(): Promise<NextResponse> {
  try {
    const data = await backendRequest<unknown>("/dashboard/stats");
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
