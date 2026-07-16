import { describe, expect, it } from 'vitest';

import { mapTranscriptResult } from '../transcript-mapper';

describe('mapTranscriptResult', () => {
  it('maps a final transcript result', () => {
    const result = mapTranscriptResult({
      is_final: true,
      channel: { alternatives: [{ transcript: 'hello world', confidence: 0.98 }] },
    });

    expect(result).toEqual({ text: 'hello world', isFinal: true, confidence: 0.98 });
  });

  it('maps an interim (non-final) transcript result', () => {
    const result = mapTranscriptResult({
      is_final: false,
      channel: { alternatives: [{ transcript: 'hel', confidence: 0.4 }] },
    });

    expect(result).toEqual({ text: 'hel', isFinal: false, confidence: 0.4 });
  });

  it('returns null for an empty transcript (silence/non-speech audio)', () => {
    expect(mapTranscriptResult({ channel: { alternatives: [{ transcript: '' }] } })).toBeNull();
  });

  it('returns null when no alternatives are present', () => {
    expect(mapTranscriptResult({ channel: { alternatives: [] } })).toBeNull();
  });

  it('trims whitespace-only transcripts to null', () => {
    expect(mapTranscriptResult({ channel: { alternatives: [{ transcript: '   ' }] } })).toBeNull();
  });

  it('defaults confidence to 0 when absent', () => {
    const result = mapTranscriptResult({ channel: { alternatives: [{ transcript: 'hi' }] } });
    expect(result?.confidence).toBe(0);
  });
});
