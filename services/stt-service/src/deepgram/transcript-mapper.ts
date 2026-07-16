/**
 * Minimal shape of Deepgram's streaming `Results` message that we actually read.
 * Deepgram's real payload has more fields (metadata, speech_final, etc.); this type
 * only declares what mapTranscriptResult uses, so it stays correct across SDK versions
 * even if unrelated fields change shape upstream.
 */
export interface DeepgramResultsMessage {
  is_final?: boolean;
  channel?: {
    alternatives?: Array<{ transcript?: string; confidence?: number }>;
  };
}

export interface TranscriptChunk {
  text: string;
  isFinal: boolean;
  confidence: number;
}

/** Returns null for empty/non-speech results — callers should skip forwarding these
 * rather than sending empty transcript frames to the client. */
export function mapTranscriptResult(message: DeepgramResultsMessage): TranscriptChunk | null {
  const alternative = message.channel?.alternatives?.[0];
  const text = alternative?.transcript?.trim();
  if (!text) return null;

  return {
    text,
    isFinal: message.is_final ?? false,
    confidence: alternative?.confidence ?? 0,
  };
}
