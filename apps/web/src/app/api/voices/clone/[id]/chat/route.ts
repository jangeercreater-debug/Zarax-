import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/route-handler";
import { getAccessToken } from "@/lib/auth-cookies";
import { BACKEND_URL } from "@/lib/server-api-client";

const SYSTEM_PROMPT = `You are a helpful AI assistant.
VERY IMPORTANT RULES:
1. Keep responses MAXIMUM 1 sentence — never more.
2. If user writes in Hindi → reply in Hindi only.
3. If user writes in English → reply in English only.
4. If user writes in Hinglish → reply in Hinglish.
5. Be warm and natural like a friend.
6. Never mention you are an AI.`;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const { text, history = [] } = await req.json() as {
      text: string;
      history: Array<{ role: "user" | "assistant"; content: string }>;
    };

    if (!text?.trim()) {
      return NextResponse.json({ error: "Text required" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
    }

    // Step 1: Claude se jawab lo (direct fetch — no SDK needed)
    const messages = [
      ...history.slice(-6),
      { role: "user" as const, content: text },
    ];

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 80,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!claudeRes.ok) {
      return NextResponse.json({ error: "Claude API error" }, { status: 500 });
    }

    const claudeData = await claudeRes.json() as {
      content: Array<{ type: string; text: string }>;
    };

    const responseText = claudeData.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("") || "Mujhe samajh nahi aaya, dobara bolein.";

    // Step 2: Cloned voice mein synthesize karo
    const accessToken = getAccessToken();
    const audioResponse = await fetch(
      `${BACKEND_URL}/v1/voices/clone/${params.id}/preview`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ text: responseText }),
      }
    );

    if (!audioResponse.ok) {
      return NextResponse.json({ text: responseText, audioAvailable: false });
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString("base64");

    return NextResponse.json({
      text: responseText,
      audioBase64,
      audioAvailable: true,
    });

  } catch (error) {
    return handleRouteError(error);
  }
}
