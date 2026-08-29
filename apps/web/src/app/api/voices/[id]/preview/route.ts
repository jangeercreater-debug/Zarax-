import { NextRequest, NextResponse } from "next/server";
import { getAccessToken, getRefreshToken, setAuthCookies } from "@/lib/auth-cookies";
import { BACKEND_URL } from "@/lib/server-api-client";

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Voice preview route — proxies binary WAV audio from the API backend.
 *
 * Cannot use backendRequest() here because that helper always calls
 * response.text() → JSON.parse(), which corrupts binary audio data.
 *
 * This route pipes the raw binary response directly to the browser,
 * preserving Content-Type: audio/wav and Content-Length headers.
 *
 * Error responses from the API (JSON, non-2xx) are forwarded as JSON
 * so the frontend can display structured VOICE_* error codes.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const body = await req.json().catch(() => ({}));
  const accessToken = getAccessToken();

  const doRequest = async (token: string | undefined): Promise<Response> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    return fetch(`${BACKEND_URL}/v1/voices/${params.id}/preview`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
    });
  };

  let response = await doRequest(accessToken);

  // Token refresh on 401
  if (response.status === 401) {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        const refreshRes = await fetch(`${BACKEND_URL}/v1/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json() as { data: AuthTokens };
          setAuthCookies(refreshData.data);
          response = await doRequest(refreshData.data.accessToken);
        }
      } catch {
        // Refresh failed — fall through to return original 401
      }
    }
  }

  // Error response — forward JSON error body to frontend
  if (!response.ok) {
    const errorText = await response.text().catch(() => "{}");
    let errorBody: unknown;
    try { errorBody = JSON.parse(errorText); } catch { errorBody = { error: { code: "VOICE_PREVIEW_UNAVAILABLE", message: errorText } }; }
    return NextResponse.json(errorBody, { status: response.status });
  }

  // Success — pipe binary audio directly to browser
  const audioBuffer = await response.arrayBuffer();
  const contentType = response.headers.get("Content-Type") ?? "audio/wav";
  const voiceId = response.headers.get("X-Voice-Id") ?? params.id;

  return new NextResponse(audioBuffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(audioBuffer.byteLength),
      "X-Voice-Id": voiceId,
      "Cache-Control": "no-store",
    },
  });
}
