import { describe, expect, it } from 'vitest';

import {
  calculateEmbeddingCostUsd,
  calculateLlmCostUsd,
  calculateSttCostUsd,
  calculateTtsCostUsd,
} from '../pricing-table';

describe('pricing-table', () => {
  it('calculates LLM cost from input/output token pricing', () => {
    const cost = calculateLlmCostUsd('anthropic', 'claude-sonnet-4-5', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(3 + 15, 5);
  });

  it('returns 0 for an unknown provider/model rather than throwing', () => {
    expect(calculateLlmCostUsd('unknown', 'unknown-model', 1000, 1000)).toBe(0);
  });

  it('calculates STT cost per second from the per-minute rate', () => {
    const cost = calculateSttCostUsd('deepgram', 60);
    expect(cost).toBeCloseTo(0.0043 * 60, 5);
  });

  it('calculates TTS cost per character from the per-1000-char rate', () => {
    const cost = calculateTtsCostUsd('cartesia', 1000);
    expect(cost).toBeCloseTo(0.03, 5);
  });

  it('calculates embedding cost per token', () => {
    const cost = calculateEmbeddingCostUsd('openai:text-embedding-3-small', 1_000_000);
    expect(cost).toBeCloseTo(0.02, 5);
  });

  it('returns 0 for unknown STT/TTS/embedding providers', () => {
    expect(calculateSttCostUsd('unknown', 60)).toBe(0);
    expect(calculateTtsCostUsd('unknown', 1000)).toBe(0);
    expect(calculateEmbeddingCostUsd('unknown', 1000)).toBe(0);
  });
});
