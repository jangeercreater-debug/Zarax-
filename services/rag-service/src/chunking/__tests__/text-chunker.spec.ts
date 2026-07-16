import { describe, expect, it } from 'vitest';

import { chunkText } from '../text-chunker';

describe('chunkText', () => {
  it('returns an empty array for empty/whitespace-only input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n  ')).toEqual([]);
  });

  it('returns a single chunk when the text fits within maxChunkSize', () => {
    const text = 'This is a short sentence. Here is another one.';
    const chunks = chunkText(text, { maxChunkSize: 1000 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('short sentence');
  });

  it('splits into multiple chunks when the text exceeds maxChunkSize', () => {
    const sentence = 'A reasonably long sentence about ZaraX voice agents. ';
    const text = sentence.repeat(20);
    const chunks = chunkText(text, { maxChunkSize: 200, overlapSize: 20 });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(250); // maxChunkSize + a sentence's worth of slack
    }
  });

  it('never splits in the middle of a sentence', () => {
    const text = 'First sentence here. Second sentence here. Third sentence here.';
    const chunks = chunkText(text, { maxChunkSize: 30, overlapSize: 5 });

    for (const chunk of chunks) {
      expect(chunk.trim()).toMatch(/[.!?]$/);
    }
  });

  it('carries overlap context between chunks', () => {
    const text = 'Alpha sentence one. Beta sentence two. Gamma sentence three. Delta sentence four.';
    const chunks = chunkText(text, { maxChunkSize: 35, overlapSize: 15 });

    expect(chunks.length).toBeGreaterThan(1);
    // The second chunk should contain a tail fragment from the first chunk's end.
    const firstChunkTail = chunks[0].slice(-10);
    expect(chunks[1]).toEqual(expect.stringContaining(firstChunkTail.split(' ').slice(-1)[0]));
  });
});
