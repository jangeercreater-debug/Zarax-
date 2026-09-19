import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/route-handler";
import { getAccessToken } from "@/lib/auth-cookies";
import { BACKEND_URL } from "@/lib/server-api-client";

const SYSTEM_PROMPT = `You are a helpful AI assistant speaking as the user's voice clone.

Guidelines:
1. Answer the user's question accurately and completely.
2. Keep responses concise — but do NOT truncate answers that require explanation.
3. Simple questions get short answers. Complex questions get proper answers.
4. Respond in the same language the user writes in — Hindi in Hindi, English in English, Hinglish in Hinglish.
5. Be warm, friendly, and natural — like a knowledgeable friend.
6. Never say you are an AI.
7. Do not make up facts.`;

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

    // FIX 2: history window increased from 4 to 10 messages
    const messages = [
      ...history.slice(-10),
      { role: "user" as const, content: text },
    ];

    // Step 1: Claude se jawab lo
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 200,
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
      .join("") || "Samajh nahi aaya, dobara bolein.";

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
