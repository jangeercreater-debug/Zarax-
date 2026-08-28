import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/route-handler";
import { backendRequest } from "@/lib/server-api-client";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const qs = req.nextUrl.searchParams.toString();
    const data = await backendRequest<unknown>("/voices" + (qs ? "?" + qs : ""));
    return NextResponse.json(data);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const data = await backendRequest<unknown>("/voices", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return NextResponse.json(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
