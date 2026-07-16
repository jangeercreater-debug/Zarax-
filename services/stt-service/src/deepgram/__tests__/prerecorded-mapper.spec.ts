import { describe, expect, it } from 'vitest';

import { mapPrerecordedResult } from '../prerecorded-mapper';

describe('mapPrerecordedResult', () => {
  it('maps a well-formed prerecorded response', () => {
    const result = mapPrerecordedResult({
      results: { channels: [{ alternatives: [{ transcript: 'hello there', confidence: 0.91 }] }] },
    });
    expect(result).toEqual({ text: 'hello there', confidence: 0.91 });
  });

  it('returns null when the transcript is empty', () => {
    expect(
      mapPrerecordedResult({ results: { channels: [{ alternatives: [{ transcript: '' }] }] } }),
    ).toBeNull();
  });

  it('returns null when channels are missing entirely', () => {
    expect(mapPrerecordedResult({})).toBeNull();
  });

  it('defaults confidence to 0 when absent', () => {
    const result = mapPrerecordedResult({
      results: { channels: [{ alternatives: [{ transcript: 'hi' }] }] },
    });
    expect(result?.confidence).toBe(0);
  });
});
