import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/route-handler";
import { backendRequest } from "@/lib/server-api-client";

interface RoomToken {
  callId: string;
  roomName: string;
  livekitUrl: string;
  token: string;
}

const ZARAX_AGENT_ID = "bf25552c-2814-4cc6-a098-67100fbe3ef5";
const VOICE_GATEWAY_URL = process.env.VOICE_GATEWAY_URL ?? process.env.BACKEND_URL ?? "";

export async function POST(): Promise<NextResponse> {
  try {
    const data = await backendRequest<RoomToken>("/rooms/token", {
      method: "POST",
      body: JSON.stringify({ agentId: ZARAX_AGENT_ID }),
    }, VOICE_GATEWAY_URL);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
