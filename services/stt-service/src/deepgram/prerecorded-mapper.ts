export interface DeepgramPrerecordedResponse {
  results?: {
    channels?: Array<{
      alternatives?: Array<{ transcript?: string; confidence?: number }>;
    }>;
  };
}

export interface BatchTranscriptResult {
  text: string;
  confidence: number;
}

/** Returns null when Deepgram returns no usable alternative (e.g. silent/empty audio). */
export function mapPrerecordedResult(
  response: DeepgramPrerecordedResponse,
): BatchTranscriptResult | null {
  const alternative = response.results?.channels?.[0]?.alternatives?.[0];
  const text = alternative?.transcript?.trim();
  if (!text) return null;

  return { text, confidence: alternative?.confidence ?? 0 };
}
