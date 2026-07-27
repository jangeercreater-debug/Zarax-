import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/route-handler";

interface RoomToken {
  callId: string;
  roomName: string;
  livekitUrl: string;
  token: string;
}

const ZARAX_AGENT_ID = "bf25552c-2814-4cc6-a098-67100fbe3ef5";
const GW = process.env.VOICE_GATEWAY_URL ?? "https://zaraxvoice-gateway-production.up.railway.app";
const TOK = process.env.API_INTERNAL_SERVICE_TOKEN ?? "";

export async function POST(): Promise<NextResponse> {
  try {
    const res = await fetch(GW + "/v1/rooms/token", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + TOK },
      body: JSON.stringify({ agentId: ZARAX_AGENT_ID }),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ error: "Gateway error" }, { status: res.status });
    const json = await res.json() as Record<string, unknown>;
    const data = (json.data ?? json) as RoomToken;
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
