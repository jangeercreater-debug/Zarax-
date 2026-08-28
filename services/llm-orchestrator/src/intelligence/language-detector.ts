import { Injectable } from '@nestjs/common';

export type DetectedLanguage = 'hindi' | 'english' | 'hinglish' | 'punjabi' | 'urdu' | 'unknown';

export interface LanguageDetectionResult {
  language: DetectedLanguage;
  confidence: number;
  instruction: string;
}

const HINDI_PATTERNS = /[\u0900-\u097F]|(\b(kya|hai|hain|mujhe|tumhara|iska|uska|main|tum|aap|hum|kab|kaise|kyun|yaar|bhai|accha|theek|nahi|haan|bohot|bahut|abhi|matlab|agar|lekin|phir|toh|woh|yeh|unka|mera|tera|apna)\b)/gi;
const PUNJABI_PATTERNS = /(\b(ki|kiddan|kiven|tussi|menu|tenu|saadi|teri|meri|oye|sanu|kithey|kyun|hega|hegi|nahi|sat sri akal|waheguru)\b)/gi;
const _URDU_PATTERNS = /[\u0600-\u06FF]|(\b(aap|mujhe|tumhara|phir|lekin|kyunki|isliye|warna|zaroor|shayad|bilkul|shukriya|meherbani)\b)/gi;
const ENGLISH_PATTERNS = /\b(the|is|are|was|were|have|has|had|will|would|can|could|should|that|this|what|how|why|when|where|who|because|although|however|therefore)\b/gi;
const HINGLISH_MARKERS = /(\b(karo|kar|ho gaya|ho gayi|bata|bol|sun|dekh|chal|aya|ayi|gaya|gayi|lena|dena|raha|rahi|wala|wali)\b)/gi;

@Injectable()
export class LanguageDetector {
  private readonly sessionLanguages = new Map<string, DetectedLanguage>();

  /** Detect language from text and lock it for the session. */
  detectAndLock(callId: string, text: string): LanguageDetectionResult {
    const locked = this.sessionLanguages.get(callId);
    if (locked && locked !== 'unknown') {
      return { language: locked, confidence: 1.0, instruction: this.buildInstruction(locked) };
    }

    const detected = this.detect(text);
    if (detected !== 'unknown') {
      this.sessionLanguages.set(callId, detected);
    }

    return { language: detected, confidence: 0.85, instruction: this.buildInstruction(detected) };
  }

  cleanup(callId: string): void {
    this.sessionLanguages.delete(callId);
  }

  private detect(text: string): DetectedLanguage {
    const devanagari = (text.match(/[\u0900-\u097F]/g) ?? []).length;
    if (devanagari > 2) return 'hindi';

    const arabic = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
    if (arabic > 2) return 'urdu';

    const hindiScore = (text.match(HINDI_PATTERNS) ?? []).length;
    const englishScore = (text.match(ENGLISH_PATTERNS) ?? []).length;
    const punjabiScore = (text.match(PUNJABI_PATTERNS) ?? []).length;
    const hinglishScore = (text.match(HINGLISH_MARKERS) ?? []).length;

    if (punjabiScore >= 2) return 'punjabi';

    if (hindiScore >= 3 && englishScore >= 2) return 'hinglish';
    if (hinglishScore >= 2 && englishScore >= 1) return 'hinglish';

    if (hindiScore >= 2 && englishScore === 0) return 'hindi';
    if (englishScore >= 3 && hindiScore === 0) return 'english';
    if (hindiScore >= 1 && englishScore >= 1) return 'hinglish';

    return 'unknown';
  }

  private buildInstruction(language: DetectedLanguage): string {
    const instructions: Record<DetectedLanguage, string> = {
      hindi: '[Language lock] User speaks Hindi. Reply ONLY in Hindi. Use natural feminine verb forms (sun rahi hoon, soch rahi thi). Do NOT switch to English.',
      english: '[Language lock] User speaks English. Reply ONLY in English. Do NOT mix Hindi words.',
      hinglish: '[Language lock] User speaks Hinglish (Hindi-English mix). Reply in natural Hinglish — mix both languages the way the user does. Do NOT force pure Hindi or pure English.',
      punjabi: '[Language lock] User speaks Punjabi. Reply ONLY in Punjabi. Be warm and natural.',
      urdu: '[Language lock] User speaks Urdu. Reply ONLY in Urdu. Be warm and respectful.',
      unknown: '[Language] Detect the user\'s preferred language from context and match it naturally.',
    };
    return instructions[language];
  }
}
