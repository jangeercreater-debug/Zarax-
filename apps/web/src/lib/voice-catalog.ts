/**
 * Static reference catalogs for the voice/STT selectors — NOT a live sync with
 * Cartesia's or Deepgram's own APIs (no such integration exists yet). These are
 * well-known, stable identifiers as of this milestone; update this file if either
 * provider's catalog changes materially, or replace with a live-fetched endpoint if
 * that becomes worth the added complexity.
 */

export interface CatalogOption {
  value: string;
  label: string;
  description?: string;
}

export const CARTESIA_VOICES: CatalogOption[] = [
  { value: 'sonic-english-warm', label: 'Warm (English)', description: 'Friendly, approachable tone' },
  { value: 'sonic-english-professional', label: 'Professional (English)', description: 'Clear, business-appropriate' },
  { value: 'sonic-english-energetic', label: 'Energetic (English)', description: 'Upbeat, enthusiastic' },
  { value: 'sonic-english-calm', label: 'Calm (English)', description: 'Soothing, measured pace' },
];

export const DEEPGRAM_MODELS: CatalogOption[] = [
  { value: 'nova-2', label: 'Nova 2', description: 'Best general-purpose accuracy' },
  { value: 'nova-2-phonecall', label: 'Nova 2 (Phone call)', description: 'Tuned for telephony audio' },
  { value: 'enhanced', label: 'Enhanced', description: 'Lower latency, slightly lower accuracy' },
];
