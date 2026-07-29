import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/route-handler";
import { getAccessToken } from "@/lib/auth-cookies";

interface RoomToken {
  callId: string;
  roomName: string;
  livekitUrl: string;
  token: string;
}

const ZARAX_AGENT_ID = "bf25552c-2814-4cc6-a098-b7100fbe3ef5";
const GW = process.env.VOICE_GATEWAY_URL ?? "https://zaraxvoice-gateway-production.up.railway.app";
const INTERNAL_TOKEN = process.env.API_INTERNAL_SERVICE_TOKEN ?? "";

export async function POST(): Promise<NextResponse> {
  try {
    // Try user JWT first, fall back to internal token
    const accessToken = getAccessToken() ?? INTERNAL_TOKEN;
    const res = await fetch(GW + "/rooms/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + accessToken,
      },
      body: JSON.stringify({ agentId: ZARAX_AGENT_ID }),
      cache: "no-store",
    });
    if (!res.ok) {
      const txt = await res.text();
      return NextResponse.json({ error: txt }, { status: res.status });
    }
    const json = await res.json() as Record<string, unknown>;
    const data = (json.data ?? json) as RoomToken;
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
