import { Injectable } from '@nestjs/common';
import type { Emotion, EmotionResult } from './emotion-detector';

export interface AdaptationProfile {
  voiceTone: string;
  speakingSpeed: string;
  sentenceLength: string;
  energyLevel: string;
  empathyGuidance: string;
  wordChoice: string;
  pauseGuidance: string;
}

const PROFILES: Record<Emotion, AdaptationProfile> = {
  happy: {
    voiceTone: 'Warm and bright.',
    speakingSpeed: 'Slightly upbeat pace.',
    sentenceLength: 'Normal, flowing sentences.',
    energyLevel: 'Medium-high energy — match their good mood.',
    empathyGuidance: 'Share in their happiness genuinely. Smile through your words.',
    wordChoice: 'Light, positive words. "That\'s great!", "Aww nice!", "Love that for you."',
    pauseGuidance: 'Minimal pauses — let the good energy flow naturally.',
  },
  excited: {
    voiceTone: 'Energetic and animated.',
    speakingSpeed: 'Slightly faster, matching their excitement.',
    sentenceLength: 'Short bursts of enthusiasm mixed with longer curious questions.',
    energyLevel: 'High energy — mirror their excitement fully.',
    empathyGuidance: 'Get genuinely curious and excited with them. Ask what happened.',
    wordChoice: '"No way!", "Tell me everything!", "That\'s amazing!", "Wait what happened?!"',
    pauseGuidance: 'Very few pauses. Quick, engaged responses.',
  },
  sad: {
    voiceTone: 'Soft, gentle, warm.',
    speakingSpeed: 'Slower than usual. No rush.',
    sentenceLength: 'Short, gentle sentences. Do not overwhelm with words.',
    energyLevel: 'Low, calm energy. Do not be cheerful — that feels dismissive.',
    empathyGuidance: 'Just listen first. Do not immediately try to fix or advise. Validate their feelings before anything else.',
    wordChoice: '"Oh no...", "I\'m really sorry...", "That sounds really hard.", "I\'m here."',
    pauseGuidance: 'Use "..." often. Let silence breathe. Do not rush to fill space.',
  },
  angry: {
    voiceTone: 'Calm and steady — never match their anger.',
    speakingSpeed: 'Measured, unhurried pace.',
    sentenceLength: 'Short, clear sentences. No rambling.',
    energyLevel: 'Low-medium, grounding energy.',
    empathyGuidance: 'Acknowledge their frustration without being defensive. Do not argue or dismiss. Let them vent first.',
    wordChoice: '"That sounds really frustrating.", "I get why you\'re upset.", "That\'s completely valid."',
    pauseGuidance: 'Brief pause before responding — never react instantly to anger.',
  },
  confused: {
    voiceTone: 'Patient and clear.',
    speakingSpeed: 'Slightly slower, deliberate.',
    sentenceLength: 'Short, simple sentences. Break things into small pieces.',
    energyLevel: 'Calm, steady energy.',
    empathyGuidance: 'Do not make them feel silly for being confused. Simplify without condescending.',
    wordChoice: '"Let me explain that differently...", "No worries, let\'s break it down."',
    pauseGuidance: 'Pause between each point so it can sink in.',
  },
  tired: {
    voiceTone: 'Soft, low-key, soothing.',
    speakingSpeed: 'Slow and relaxed.',
    sentenceLength: 'Very short sentences. Do not demand mental effort.',
    energyLevel: 'Low energy — match their tiredness, do not be loud or hyper.',
    empathyGuidance: 'Be gentle. Maybe suggest rest. Do not push for long conversation.',
    wordChoice: '"You sound exhausted.", "Get some rest, okay?", "I hear you."',
    pauseGuidance: 'Slow, unhurried pauses. Let the conversation breathe.',
  },
  lonely: {
    voiceTone: 'Warm, close, intimate.',
    speakingSpeed: 'Unhurried — make them feel you have time for them.',
    sentenceLength: 'Medium — enough to feel present, not rushed.',
    energyLevel: 'Warm, steady presence.',
    empathyGuidance: 'Make them feel truly heard. Stay present. Do not rush to end the conversation.',
    wordChoice: '"I\'m here.", "I\'m really glad you told me.", "You\'re not alone right now."',
    pauseGuidance: 'Gentle pauses that feel like companionship, not silence.',
  },
  stressed: {
    voiceTone: 'Calm, grounding, steady.',
    speakingSpeed: 'Slow and deliberate — help them slow down too.',
    sentenceLength: 'Short, clear, uncomplicated.',
    energyLevel: 'Low-medium, calming energy.',
    empathyGuidance: 'Help them feel less overwhelmed. Do not add more information than needed. One thing at a time.',
    wordChoice: '"Let\'s take this one thing at a time.", "That\'s a lot. I hear you."',
    pauseGuidance: 'Deliberate pauses to slow the pace of the conversation.',
  },
  nervous: {
    voiceTone: 'Calm, reassuring, steady.',
    speakingSpeed: 'Slow, confident pace.',
    sentenceLength: 'Short, reassuring sentences.',
    energyLevel: 'Steady, grounding energy — be the calm in their storm.',
    empathyGuidance: 'Reassure without dismissing their worry. Validate then gently ground them.',
    wordChoice: '"It\'s okay.", "Take a breath.", "You\'ve got this.", "I\'m right here."',
    pauseGuidance: 'Calm, steady pauses — model the calm you want them to feel.',
  },
  neutral: {
    voiceTone: 'Natural, warm baseline.',
    speakingSpeed: 'Normal conversational pace.',
    sentenceLength: 'Natural variation, mix short and long.',
    energyLevel: 'Medium — normal conversational energy.',
    empathyGuidance: 'Standard warm, attentive presence.',
    wordChoice: 'Natural, varied conversational language.',
    pauseGuidance: 'Natural conversational pauses.',
  },
};

@Injectable()
export class EmotionalAdaptationEngine {

  adapt(result: EmotionResult): AdaptationProfile {
    const base = PROFILES[result.emotion];
    if (result.intensity === 'strong' && result.emotion !== 'neutral') {
      return this.intensify(base, result.emotion);
    }
    return base;
  }

  generatePrompt(result: EmotionResult): string {
    if (result.emotion === 'neutral') return '';
    const profile = this.adapt(result);
    return [
      `[Emotional Intelligence] Detected emotion: ${result.emotion} (${result.intensity} intensity).`,
      `Voice tone: ${profile.voiceTone}`,
      `Speaking pace: ${profile.speakingSpeed}`,
      `Sentence style: ${profile.sentenceLength}`,
      `Energy level: ${profile.energyLevel}`,
      `Empathy: ${profile.empathyGuidance}`,
      `Word choice: ${profile.wordChoice}`,
      `Pauses: ${profile.pauseGuidance}`,
    ].join('\n');
  }

  private intensify(profile: AdaptationProfile, emotion: Emotion): AdaptationProfile {
    const boosts: Partial<Record<Emotion, string>> = {
      sad: 'This seems really significant to them — be extra gentle and present. Do not minimize it.',
      angry: 'Their frustration is strong — stay extra calm and grounded. Give them room to express it fully.',
      excited: 'Their excitement is high — really lean into celebrating with them.',
      stressed: 'They seem very overwhelmed — be extra calming, keep things very simple.',
      nervous: 'Their anxiety seems high — be extra reassuring and steady.',
      lonely: 'This loneliness feels deep — be especially warm and present, do not rush this conversation.',
    };
    const extra = boosts[emotion];
    return extra ? { ...profile, empathyGuidance: profile.empathyGuidance + ' ' + extra } : profile;
  }
}

