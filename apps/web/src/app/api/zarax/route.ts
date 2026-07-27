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
const GW = process.env.VOICE_GATEWAY_URL ?? "https://zaraxvoice-gateway-production.up.railway.app";

export async function POST(): Promise<NextResponse> {
  try {
    // Use backendRequest with voice-gateway URL - this forwards the user JWT cookie automatically
    const data = await backendRequest<RoomToken>(
      "/rooms/token",
      { method: "POST", body: JSON.stringify({ agentId: ZARAX_AGENT_ID }) },
      GW,
    );
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
