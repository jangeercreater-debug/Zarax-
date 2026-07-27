import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/route-handler";

interface RoomToken {
  callId: string;
  roomName: string;
  livekitUrl: string;
  token: string;
}

const ZARAX_AGENT_ID = "bf25552c-2814-4cc6-a098-67100fbe3ef5";
const VOICE_GATEWAY_URL = process.env.VOICE_GATEWAY_URL ?? "https://zaraxvoice-gateway-production.up.railway.app";
const INTERNAL_TOKEN = process.env.API_INTERNAL_SERVICE_TOKEN ?? "";

export async function POST(): Promise<NextResponse> {
  try {
    const res = await fetch(VOICE_GATEWAY_URL + "/v1/rooms/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + INTERNAL_TOKEN,
      },
      body: JSON.stringify({ agentId: ZARAX_AGENT_ID }),
      cache: "no-store",
    });
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }
    const json = await res.json() as { data: RoomToken };
    return NextResponse.json({ data: json.data ?? json });
  } catch (error) {
    return handleRouteError(error);
  }
}
