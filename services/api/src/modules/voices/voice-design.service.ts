import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { VoiceEngineService } from './voice-engine.service';
import type { VoiceRecord } from './dto/voice.types';

// ─── Voice Profile ────────────────────────────────────────────────────────────

export interface VoiceProfile {
  gender: 'MALE' | 'FEMALE' | 'NEUTRAL';
  ageStyle: 'child' | 'young-adult' | 'adult' | 'senior';
  accent: string;
  tone: string;
  personality: string;
  speakingStyle: string;
  speed: number;
  energy: number;
  languages: string[];
  tags: string[];
}

export interface VoiceCandidate {
  candidateId: string;
  name: string;
  description: string;
  profile: VoiceProfile;
  providerVoiceId: string;
  kokoro_voice: string;
  kokoro_lang_code: string;
  previewText: string;
  rank: number;
}

export interface DesignResult {
  requestId: string;
  prompt: string;
  profile: VoiceProfile;
  candidates: VoiceCandidate[];
}

// ─── Kokoro voice pool (all 4 voices from Phase 2) ───────────────────────────

const KOKORO_VOICE_POOL: Array<{
  providerVoiceId: string;
  kokoro_voice: string;
  kokoro_lang_code: string;
  gender: 'MALE' | 'FEMALE' | 'NEUTRAL';
  languages: string[];
  accent: string;
  tone: string;
  personality: string;
  style: string;
  name: string;
  description: string;
}> = [
  {
    providerVoiceId: 'zarax_hindi_female_001',
    kokoro_voice: 'hf_alpha',
    kokoro_lang_code: 'h',
    gender: 'FEMALE',
    languages: ['hi', 'en', 'hi-IN'],
    accent: 'Indian',
    tone: 'warm',
    personality: 'friendly',
    style: 'conversational',
    name: 'Zarax (Hindi)',
    description: 'Warm Hindi-English female voice — natural, conversational.',
  },
  {
    providerVoiceId: 'zarax_english_female_001',
    kokoro_voice: 'af_heart',
    kokoro_lang_code: 'a',
    gender: 'FEMALE',
    languages: ['en', 'en-US'],
    accent: 'American',
    tone: 'warm',
    personality: 'friendly',
    style: 'professional',
    name: 'Aria',
    description: 'Clear professional English female voice.',
  },
  {
    providerVoiceId: 'zarax_english_male_001',
    kokoro_voice: 'am_adam',
    kokoro_lang_code: 'a',
    gender: 'MALE',
    languages: ['en', 'en-US'],
    accent: 'American',
    tone: 'confident',
    personality: 'professional',
    style: 'professional',
    name: 'Alex',
    description: 'Confident professional English male voice.',
  },
  {
    providerVoiceId: 'zarax_english_female_002',
    kokoro_voice: 'af_bella',
    kokoro_lang_code: 'a',
    gender: 'FEMALE',
    languages: ['en', 'en-IN'],
    accent: 'Indian-English',
    tone: 'warm',
    personality: 'friendly',
    style: 'conversational',
    name: 'Maya',
    description: 'Warm friendly English female voice with Indian-English accent.',
  },
];

// ─── Deterministic keyword parser ────────────────────────────────────────────

const GENDER_KEYWORDS: Record<string, 'MALE' | 'FEMALE' | 'NEUTRAL'> = {
  female: 'FEMALE', woman: 'FEMALE', girl: 'FEMALE', she: 'FEMALE', her: 'FEMALE',
  mahila: 'FEMALE', aurat: 'FEMALE', ladki: 'FEMALE',
  male: 'MALE', man: 'MALE', boy: 'MALE', he: 'MALE', his: 'MALE',
  purush: 'MALE', aadmi: 'MALE', ladka: 'MALE',
  neutral: 'NEUTRAL', androgynous: 'NEUTRAL',
};

const AGE_KEYWORDS: Record<string, string> = {
  child: 'child', kid: 'child', young: 'young-adult', teen: 'young-adult',
  'young adult': 'young-adult', 'yuva': 'young-adult',
  adult: 'adult', mature: 'adult', professional: 'adult',
  senior: 'senior', old: 'senior', elderly: 'senior', experienced: 'adult',
};

const ACCENT_KEYWORDS: Record<string, string> = {
  indian: 'Indian', india: 'Indian', hindi: 'Indian', desi: 'Indian',
  hinglish: 'Indian', mumbai: 'Indian', delhi: 'Indian',
  american: 'American', us: 'American', usa: 'American',
  british: 'British', uk: 'British', english: 'British',
  australian: 'Australian', aussie: 'Australian',
};

const TONE_KEYWORDS: Record<string, string> = {
  warm: 'warm', warmth: 'warm', friendly: 'warm',
  professional: 'professional', formal: 'professional', business: 'professional',
  calm: 'calm', soothing: 'calm', relaxed: 'calm', gentle: 'calm',
  energetic: 'energetic', excited: 'energetic', enthusiastic: 'energetic', upbeat: 'energetic',
  confident: 'confident', assertive: 'confident', strong: 'confident',
  deep: 'deep', rich: 'deep', bass: 'deep',
  soft: 'soft', gentle2: 'soft', quiet: 'soft',
};

const STYLE_KEYWORDS: Record<string, string> = {
  conversational: 'conversational', casual: 'conversational', chat: 'conversational',
  baat: 'conversational', informal: 'conversational',
  professional: 'professional', formal: 'professional',
  storytelling: 'storytelling', narrative: 'storytelling', story: 'storytelling',
  news: 'news-presenter', news_presenter: 'news-presenter', anchor: 'news-presenter',
  customer: 'customer-service', service: 'customer-service', support: 'customer-service',
};

function parsePrompt(prompt: string): VoiceProfile {
  const lower = prompt.toLowerCase();

  // Gender
  let gender: 'MALE' | 'FEMALE' | 'NEUTRAL' = 'NEUTRAL';
  for (const [kw, val] of Object.entries(GENDER_KEYWORDS)) {
    if (lower.includes(kw)) { gender = val; break; }
  }

  // Age style
  let ageStyle: VoiceProfile['ageStyle'] = 'adult';
  for (const [kw, val] of Object.entries(AGE_KEYWORDS)) {
    if (lower.includes(kw)) { ageStyle = val as VoiceProfile['ageStyle']; break; }
  }

  // Accent
  let accent = 'Indian'; // default for Zarax
  for (const [kw, val] of Object.entries(ACCENT_KEYWORDS)) {
    if (lower.includes(kw)) { accent = val; break; }
  }

  // Tone
  let tone = 'warm';
  for (const [kw, val] of Object.entries(TONE_KEYWORDS)) {
    if (lower.includes(kw)) { tone = val; break; }
  }

  // Speaking style
  let speakingStyle = 'conversational';
  for (const [kw, val] of Object.entries(STYLE_KEYWORDS)) {
    if (lower.includes(kw)) { speakingStyle = val; break; }
  }

  // Speed
  let speed = 1.0;
  if (/fast|quick|rapid|tez/.test(lower)) speed = 1.2;
  else if (/slow|steady|dhimi|dheere/.test(lower)) speed = 0.85;

  // Energy
  let energy = 0.6;
  if (/high energy|energetic|enthusiastic|excited/.test(lower)) energy = 0.85;
  else if (/calm|soft|gentle|soothing|quiet/.test(lower)) energy = 0.4;

  // Languages
  const languages: string[] = ['en'];
  if (/hindi|hinglish|desi|india|indian/.test(lower)) {
    languages.push('hi');
    if (!languages.includes('hi-IN')) languages.push('hi-IN');
  }

  // Tags
  const tags: string[] = [];
  if (tone) tags.push(tone);
  if (speakingStyle) tags.push(speakingStyle);
  if (accent && !tags.includes(accent.toLowerCase())) tags.push(accent.toLowerCase());

  return { gender, ageStyle, accent, tone, personality: tone, speakingStyle, speed, energy, languages, tags };
}

// ─── Candidate ranking ────────────────────────────────────────────────────────

function scoreVoice(voice: typeof KOKORO_VOICE_POOL[0], profile: VoiceProfile): number {
  let score = 0;

  if (voice.gender === profile.gender) score += 40;
  else if (profile.gender === 'NEUTRAL') score += 20;

  const accentMatch = voice.accent.toLowerCase().includes(profile.accent.toLowerCase()) ||
    profile.accent.toLowerCase().includes(voice.accent.toLowerCase());
  if (accentMatch) score += 30;

  if (voice.tone === profile.tone) score += 20;

  const langMatch = profile.languages.some(l => voice.languages.includes(l));
  if (langMatch) score += 10;

  return score;
}

function buildPreviewText(profile: VoiceProfile): string {
  if (profile.languages.includes('hi')) {
    return 'Namaste! Main Zarax hoon. Aapki kya madad kar sakti hoon?';
  }
  return 'Hello! I am Zarax. How can I help you today?';
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class VoiceDesignService {
  private readonly logger = new Logger(VoiceDesignService.name);

  constructor(
    private readonly voiceEngine: VoiceEngineService,
  ) {}

  async design(tenantId: string, prompt: string): Promise<DesignResult> {
    const requestId = randomUUID();
    this.logger.log('VoiceDesignService: design requested', {
      tenantId, requestId, promptLength: prompt.length,
    });

    const profile = parsePrompt(prompt);

    // Score + rank all voices from pool
    const scored = KOKORO_VOICE_POOL
      .map(v => ({ voice: v, score: scoreVoice(v, profile) }))
      .sort((a, b) => b.score - a.score);

    // Top 3 candidates
    const candidates: VoiceCandidate[] = scored.slice(0, 3).map((item, idx) => ({
      candidateId: randomUUID(),
      name: item.voice.name,
      description: item.voice.description,
      profile,
      providerVoiceId: item.voice.providerVoiceId,
      kokoro_voice: item.voice.kokoro_voice,
      kokoro_lang_code: item.voice.kokoro_lang_code,
      previewText: buildPreviewText(profile),
      rank: idx + 1,
    }));

    this.logger.log('VoiceDesignService: candidates generated', {
      tenantId, requestId, count: candidates.length,
    });

    return { requestId, prompt, profile, candidates };
  }

  async previewCandidate(
    tenantId: string,
    providerVoiceId: string,
    sampleText?: string,
  ): Promise<Buffer> {
    // Voice Design candidates use providerVoiceId directly (e.g. zarax_hindi_female_001)
    // not the database UUID — call adapter directly, bypassing getVoice() lookup
    const adapter = this.voiceEngine.getActiveAdapter();
    if (!adapter) {
      throw new Error('VOICE_PROVIDER_NOT_CONFIGURED');
    }
    return adapter.preview(providerVoiceId, sampleText);
  }
  async saveVoice(
    tenantId: string,
    candidate: {
      name: string;
      description?: string;
      providerVoiceId: string;
      profile: VoiceProfile;
    },
  ): Promise<VoiceRecord> {
    return this.voiceEngine.createVoice(tenantId, {
      name: candidate.name,
      description: candidate.description,
      voiceType: 'CUSTOM',
      gender: candidate.profile.gender,
      language: candidate.profile.languages[0] ?? 'en',
      languages: candidate.profile.languages,
      accent: candidate.profile.accent,
      style: candidate.profile.speakingStyle,
      provider: 'zarax',
      providerVoiceId: candidate.providerVoiceId,
      model: 'kokoro-82m',
      metadata: {
        tone: candidate.profile.tone,
        personality: candidate.profile.personality,
        ageStyle: candidate.profile.ageStyle,
        speed: candidate.profile.speed,
        energy: candidate.profile.energy,
        tags: candidate.profile.tags,
        designedBy: 'voice-design',
      },
    });
  }
}
