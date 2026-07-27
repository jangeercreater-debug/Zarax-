import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/route-handler";
import { backendRequest } from "@/lib/server-api-client";

interface RoomToken {
  callId: string;
  roomName: string;
  livekitUrl: string;
  token: string;
}

// Dedicated Zarax personal AI agent
const ZARAX_AGENT_ID = "bf25552c-2814-4cc6-a098-67100fbe3ef5";

export async function POST(): Promise<NextResponse> {
  try {
    const data = await backendRequest<RoomToken>("/rooms/token", {
      method: "POST",
      body: JSON.stringify({ agentId: ZARAX_AGENT_ID }),
    });
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
