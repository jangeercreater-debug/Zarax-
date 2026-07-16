export interface ChunkingOptions {
  /** Target maximum characters per chunk. */
  maxChunkSize?: number;
  /** Characters of overlap carried from the end of one chunk into the start of the
   * next, so a sentence split across a chunk boundary still has context on both sides. */
  overlapSize?: number;
}

const DEFAULTS: Required<ChunkingOptions> = {
  maxChunkSize: 1000,
  overlapSize: 100,
};

/** Splits `text` into paragraphs (blank-line-separated), then sentences, recombining
 * them into chunks no larger than `maxChunkSize` — never splitting mid-sentence. */
export function chunkText(text: string, options: ChunkingOptions = {}): string[] {
  const { maxChunkSize, overlapSize } = { ...DEFAULTS, ...options };
  const normalized = text.trim();
  if (!normalized) return [];

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;

    if (candidate.length > maxChunkSize && current) {
      chunks.push(current);
      // Carry the tail of the previous chunk forward as overlap context.
      const overlap = current.slice(Math.max(0, current.length - overlapSize));
      current = `${overlap} ${sentence}`.trim();
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}
