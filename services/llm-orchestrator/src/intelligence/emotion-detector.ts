import { Injectable } from '@nestjs/common';

export type Emotion =
  | 'happy' | 'sad' | 'angry' | 'excited' | 'confused'
  | 'tired' | 'lonely' | 'stressed' | 'nervous' | 'neutral';

export type EmotionIntensity = 'mild' | 'moderate' | 'strong';

export interface EmotionResult {
  emotion: Emotion;
  intensity: EmotionIntensity;
  confidence: number;
}

const EMOTION_PATTERNS: Array<{ emotion: Emotion; patterns: RegExp[] }> = [
  {
    emotion: 'excited',
    patterns: [/\b(excited|can'?t wait|pumped|thrilled|stoked)\b/i, /\b(josh|mazaa aa gaya|bahut mazaa)\b/i],
  },
  {
    emotion: 'happy',
    patterns: [/\b(happy|great|awesome|wonderful|amazing|glad|delighted)\b/i, /\b(khush|badiya|mast|achha laga|खुश)\b/i],
  },
  {
    emotion: 'sad',
    patterns: [/\b(sad|upset|down|depressed|heartbroken|crying|miss(ing)?)\b/i, /\b(dukhi|udaas|mann nahi|रो|दुखी)\b/i],
  },
  {
    emotion: 'angry',
    patterns: [/\b(angry|furious|mad|hate|pissed|annoyed|irritated)\b/i, /\b(gussa|chidh|bhadak|गुस्सा)\b/i],
  },
  {
    emotion: 'confused',
    patterns: [/\b(confused|don'?t understand|don'?t get it|lost|unclear)\b/i, /\b(samajh nahi|confuse|uljhan|समझ नहीं)\b/i],
  },
  {
    emotion: 'tired',
    patterns: [/\b(tired|exhausted|sleepy|drained|worn out|fatigue)\b/i, /\b(thak gaya|thak gayi|neend aa rahi|थका)\b/i],
  },
  {
    emotion: 'lonely',
    patterns: [/\b(lonely|alone|no ?one (cares|talks)|isolated|by myself)\b/i, /\b(akela|akeli|akelapan|अकेला)\b/i],
  },
  {
    emotion: 'stressed',
    patterns: [/\b(stressed|overwhelmed|too much (going on|pressure)|burnt? out)\b/i, /\b(tension|pareshani|load|टेंशन)\b/i],
  },
  {
    emotion: 'nervous',
    patterns: [/\b(nervous|anxious|worried|scared|afraid|freaking out)\b/i, /\b(dar lag|ghabrahat|darr|घबराहट)\b/i],
  },
];

const INTENSIFIERS = /\b(very|so|really|extremely|super|bohot|bahut|itna|itni)\b/i;
const HAS_EXCLAMATION = /!{1,}/;
const HAS_CAPS_WORD = /\b[A-Z]{3,}\b/;

@Injectable()
export class EmotionDetector {

  detect(text: string): EmotionResult {
    const trimmed = text.trim();

    for (const { emotion, patterns } of EMOTION_PATTERNS) {
      for (const pattern of patterns) {
        if (pattern.test(trimmed)) {
          return { emotion, intensity: this.detectIntensity(trimmed), confidence: 0.8 };
        }
      }
    }

    return { emotion: 'neutral', intensity: 'mild', confidence: 0.5 };
  }

  private detectIntensity(text: string): EmotionIntensity {
    let score = 0;
    if (INTENSIFIERS.test(text)) score++;
    if (HAS_EXCLAMATION.test(text)) score++;
    if (HAS_CAPS_WORD.test(text)) score++;
    if ((text.match(/!/g) ?? []).length >= 2) score++;

    if (score >= 3) return 'strong';
    if (score >= 1) return 'moderate';
    return 'mild';
  }
}
