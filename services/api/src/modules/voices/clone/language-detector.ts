/**
 * Zarax Language Detector — Phase 7.4
 *
 * Lightweight heuristic language detection for TTS routing.
 * Routes Hindi/Hinglish to VoxCPM2, English to Chatterbox.
 *
 * NOT a production NLP classifier — confidence-based fallback included.
 * If confidence is low → 'english' (safe fallback to Chatterbox).
 */

export type DetectedLanguage = 'hindi' | 'hinglish' | 'english';

export interface LanguageDetectionResult {
  language: DetectedLanguage;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

// Devanagari Unicode block: [\u0900-\u097F]
const DEVANAGARI_RE = /[\u0900-\u097F]/;

// Common Hinglish words (Roman-script Hindi in English sentences)
const HINGLISH_RE =
  /\b(kya|hai|haan|nahin|nahi|aur|ke\s+liye|se|ko\s+|ka\s+|ki\s+|mein|toh|bhi|yaar|bhai|yeh|woh|tha|thi|the|hoon|aap|main|mera|tera|namaste|shukriya|chaliye|bilkul|theek|zaroor|matlab|seedha|batao|karein|karo|karta|karti|dono|bahut|zyada|thoda|jaldi|abhi|phir|lekin|isliye|achha|accha)\b/i;

export function detectLanguage(text: string): LanguageDetectionResult {
  if (!text?.trim()) {
    return { language: 'english', confidence: 'low', reason: 'empty_text' };
  }

  // Rule 1: Devanagari characters → Hindi (high confidence)
  if (DEVANAGARI_RE.test(text)) {
    return { language: 'hindi', confidence: 'high', reason: 'devanagari_detected' };
  }

  // Rule 2: Hinglish patterns → Hinglish (medium confidence)
  const hinglishMatches = text.match(HINGLISH_RE);
  if (hinglishMatches && hinglishMatches.length >= 2) {
    return {
      language: 'hinglish',
      confidence: 'medium',
      reason: `hinglish_words: ${hinglishMatches.slice(0, 3).join(', ')}`,
    };
  }

  // Rule 3: Single Hinglish word match (low confidence → fallback English)
  if (hinglishMatches && hinglishMatches.length === 1) {
    return {
      language: 'english',
      confidence: 'low',
      reason: 'single_hinglish_word_insufficient',
    };
  }

  // Rule 4: Default → English (Chatterbox, proven quality)
  return { language: 'english', confidence: 'high', reason: 'no_hindi_signals' };
}
